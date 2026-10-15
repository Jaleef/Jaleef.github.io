---
title: Query改写与多路召回
description: 
date: 2026-10-15
tags: []
---

# Query 改写与多路召回

> 在检索**之前**做文章：让用户那句话变成**检索器能听懂的那句话**。
>
> ★ 前面 [RAG学习.md](RAG学习.md) 的第 5～7 章都在讲"拿到 Query 之后怎么检索"。这一节回到**更前面一步**：Query 本身。
>
> **为什么是下一步**：学习路线 [agent开发学习路线.md](agent开发学习路线.md) 的 Phase 0.2。它和刚学完的 [03_RAG评估体系.md](03_RAG评估体系.md) 是**同一条闭环**——03 让你知道"检索失败有多少"，这一节正是**修复检索失败的第一大手段**。

> **引用说明**：结论下方用 `>` 或 `> ——` 标出论文名，需要时自己去搜。**没标论文的地方是我自己的工程推论**。

---

## 1. 问题的本质：Query 和 Document 是两种语言

### 1.1 这个 gap 是真实存在的

Query 是你**提问的方式**，Document 是**别人写下来的方式**。这两者天然不匹配：

```Plain
用户："怎么退钱"                     ← 口语、省略、动词化
文档："退款申请的受理与到账时限"      ← 书面、完整、名词化

用户："它支持吗"                     ← 依赖上下文，单独看无法检索
用户："A 和 B 在延迟和成本上怎么选"   ← 一个问句里藏了两个子问题
```

RIPOR 这篇论文把这个 gap 说得很直接：**输入文本和检索所需知识之间不可避免存在落差**，所以他们不再去改检索器或阅读器，而是**去改搜索 query 本身**。

> Query Rewriting for Retrieval-Augmented Large Language Models

### 1.2 为什么"改写"比"换模型"划算

```Plain
换个更强的 embedding 模型：
├─ 要重新 embedding 全量文档（贵、慢）
├─ 要重建索引
└─ ★ 而且前面笔记已经论证过：边际收益很低

改写 Query：
├─ 只在 query 侧做，★ 不用碰索引、不用重新入库
├─ 一次 LLM 调用
└─ ★ 而且它是"检索失败"的通用解药——不改索引就能提升召回
```

> ★ **这是本节的核心性价比论点**：改写是**唯一一个不动索引就能显著改善检索的手段**。
> 和你笔记里「文档解析决定 chunking 上限」是同一类判断——**找准那个"改动小、影响大"的环节**。

---

## 2. 四种改写手法

```Plain
① 查询扩展 —— 补同义词、补术语        → Query2doc
② HyDE     —— 让 LLM 先编一个"假答案"  → HyDE
③ 改写重构 —— 直接让 LLM 重写 query    → RIPOR
④ 子问题拆分 —— 一个复杂问题拆成多个   → Least-to-Most / Self-Ask
```

### 2.1 查询扩展（Query Expansion）

**做法**：让 LLM 根据 query 生成一段**伪文档（pseudo-document）**，再把伪文档拼进 query 一起检索。

```Plain
Query:  "怎么退钱"
        ↓ LLM few-shot 生成伪文档
Pseudo-doc: "退款申请流程：用户可在订单页提交退款申请，
             审核通过后款项将退回原支付渠道……"
        ↓ 拼起来检索
Query + Pseudo-doc → 检索
```

**效果**（论文实测）：在 MS-MARCO、TREC DL 等数据集上，**无需任何模型微调**，把 BM25 提升 **3%～15%**；对 SOTA dense retriever 在域内和域外也都有提升。

> Query2doc: Query Expansion with Large Language Models

> ★ 注意它提升的是 **BM25 也提升 dense**——说明它补的是**词面**信息（同义词、术语），这正是关键词检索最缺的。
> 顺便：这和你笔记里「向量补 BM25 的语义，BM25 补向量的字面」是**同一个互补关系**，Query2doc 相当于在**查询侧**又加了一层字面补充。

### 2.2 ★ HyDE：先编一个假答案

**做法**：不是改写 query，而是让 LLM **生成一个假设性的文档（hypothetical document）**，然后用它去检索。

```Plain
                     传统检索
Query ──────────────────────────────→ 向量空间
        ↑ query 的向量，和文档向量"不像"

                     HyDE
Query → LLM → 假文档 ────────────────→ 向量空间
                ↑ 假文档的向量，和真文档"很像"
```

**论文给出的关键机制**——这一点很多人没讲清楚：

> 假文档"捕捉了相关性模式，但它是不真实的，可能包含错误细节"；第二步用编码器把它编码成向量，
> **"这一步把生成的文档锚定到真实语料上，编码器的 dense bottleneck 过滤掉了不正确的细节"**。

> Precise Zero-Shot Dense Retrieval without Relevance Labels

> ★★ **"dense bottleneck 过滤掉错误细节"是本节的精髓**。
> 直觉上你会担心"让 LLM 编内容，编错了怎么办"——论文的回答是：**编错的细节会被 embedding 这个有损压缩过程过滤掉**，留下的是"相关性模式"。
> 这正好复用你笔记里第一条主线：**「Embedding 保留语义、扔掉字面」**——在 HyDE 里，这个"缺点"变成了优点。

**实测**：HyDE **显著优于当时最强的无监督 dense retriever Contriever**，并达到**接近微调检索器**的水平；跨任务（网页搜索、QA、事实验证）和跨语言（sw、ko、ja 等）都成立。

> Precise Zero-Shot Dense Retrieval without Relevance Labels

**代价**：多一次 LLM 调用，且生成一段文档比改写一句 query 更贵。

### 2.3 改写重构：RIPOR 框架

**论文提出的范式转变**：

```Plain
传统：Retrieve → Read        （检索，然后读）
RIPOR：Rewrite → Retrieve → Read   （先改写，再检索，再读）
```

> Query Rewriting for Retrieval-Augmented Large Language Models

论文还做了一件更工程化的事：**训练一个小模型当 rewriter**，用 **LLM reader 的反馈做强化学习**来训练它，目的是让 query 更好地对齐那些冻结的模块。

> Query Rewriting for Retrieval-Augmented Large Language Models

> ★ **对你的启发**：如果你后面要做**多轮对话 RAG**（Phase 0.4），RIPOR 的"小 rewriter + 大 reader"这个结构值得记——
> 改写是个高频、轻量的任务，**不需要用最贵的模型**。这是省钱的关键设计。

### 2.4 子问题拆分（Query Decomposition）

**先看为什么需要它**——Self-Ask 论文提出并测量了一个概念叫**组合性缺口（compositionality gap）**：

> 即"模型能正确回答所有子问题，却无法给出整体答案"的比例。

> Measuring and Narrowing the Compositionality Gap in Language Models

**这个结论非常反直觉，值得记住**：

> 随着模型规模增大，**单跳问答能力的提升快于多跳能力**，因此**组合性缺口并没有缩小**。

> Measuring and Narrowing the Compositionality Gap in Language Models

翻译成工程语言：**"换个更大的模型就能解决多跳问题"这个想法是错的。**

#### 两种拆分方法

| 方法                    | 做法                                                                                                                   | 出处                                                                       |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| **Least-to-Most** | 把复杂问题**分解成一系列更简单的子问题**，再**按顺序**求解；每个子问题的求解**借助前面已解决的答案** | Least-to-Most Prompting Enables Complex Reasoning in Large Language Models |
| **Self-Ask**      | 模型**显式地向自己提出（并回答）后续问题**，然后再回答原问题                                                     | Measuring and Narrowing the Compositionality Gap in Language Models        |

**Least-to-Most 的实测强度**（ICLR 2023）：在 GPT-3 code-davinci-002 上，仅用 **14 个示例**，就能让 SCAN 组合泛化基准在任何 split（含 length split）上达到**至少 99%** 准确率；而 chain-of-thought 只有 **16%**。

> Least-to-Most Prompting Enables Complex Reasoning in Large Language Models

> ★ 这组数字（99% vs 16%）值得记住——**它说明"问题怎么被拆开"比"模型多大"更关键**。

**Self-Ask 的额外好处**（和你关系最大的一条）：

> self-ask 的结构化提示**让它可以轻松接入搜索引擎**来回答那些后续问题，从而进一步提升准确率。

> Measuring and Narrowing the Compositionality Gap in Language Models

> ★★ **这句话直接指向 Agent**：Self-Ask 的"提问 → 检索 → 再提问"结构，**本质上就是 Agent Loop 的雏形**。
> 所以 Phase 0.2 学到的拆分技术，到 Phase 1 会自然长成工具调用循环——**这是从 RAG 走向 Agent 的最短路径之一**。

---

## 3. 多路召回与融合

### 3.1 为什么"改写"和"多路"要一起讲

```Plain
改写：把 1 个 query 变成 1 个"更好的" query
多路：把 1 个 query 变成 N 个 query，各查一遍，再融合

★ 两者其实是同一件事的两端：
  改写 = N=1 的退化情形
  多路 = 改写的不确定性解法（不赌哪一个改写最好，全都要）
```

**多路召回的价值**：改写有随机性，**你可能改得更好、也可能改坏**。多路召回把这部分风险对冲掉了。

### 3.2 融合策略：RRF vs 归一化加权

**RRF（Reciprocal Rank Fusion）**——不要直接比较两个检索器的分数，而是比较它们的**排名**：

```LaTeX
RRF(d) = Σ_i  w_i / (k + rank_i(d))

k ≈ 60    # 经验值：压平头部差距，防止某个检索器的第 1 名"一票通吃"
w_i       # 各检索器权重，如 BM25 0.3 / 向量检索 0.7
```

> 详细推导和手算例子见 [RAG学习.md](RAG学习.md) 第 7.1.3 节（RRF）。

> ★ 老实说：RRF 的原始论文出处我这次**没能核实**（ACM 站点拒绝访问），所以不在这里列具体论文名。
> 上面这条公式的出处指向你自己的笔记。**如果你要写论文引用它，请自己确认一下原始文献。**

**两种融合策略的取舍**：

| 策略                 | 优点                 | 缺点                                  |
| -------------------- | -------------------- | ------------------------------------- |
| **RRF**        | 免调参、跨检索器鲁棒 | ★ 只用排名，**丢掉了分数信息** |
| **归一化加权** | 保留置信度           | 需要调参（min-max / z-score）         |

**RRF 丢分数为什么是问题**：

```Plain
BM25 给了某文档 50 分（第 1 名，遥遥领先）
向量检索给了它 0.95（第 3 名）
        ↑
这种"高置信信号"在 RRF 里被抹平成普通的一次排名贡献
```

> ★ 这就是为什么 RRF 是**默认选择而不是最优选择**——它胜在**免调参、跨检索器鲁棒**。

### 3.3 Self-Query：让元数据过滤真正用起来

**问题**：你在 [RAG学习.md](RAG学习.md) 第 8 章学过元数据过滤，但那章的 `where` 条件**是谁写的**？

```Plain
❌ 没有 Self-Query：
   用户："去年的财报里怎么说的"
   → 你只能硬编码 filter: year=2025，或者干脆不过滤

✅ 有 Self-Query：
   用户："去年的财报里怎么说的"
   → LLM 解析出 → { query: "怎么说的", filter: { year: 2025, doc_type: "财报" } }
   → 向量检索 + 元数据过滤一起执行
```

> ★ **Self-Query 是把「元数据过滤」从"手写条件"变成"模型自动生成条件"的关键一步。**
> 没有它，你笔记里学的元数据过滤就只是一个"理论上很有用"的章节。

> ⚠️ **但它同时引入一个新风险**：过滤条件由模型生成 → **模型可能忘记带、也可能被诱导改掉**。
> 这正是 [RAG学习.md](RAG学习.md) 8.2 多租户那条铁律的原因——**租户隔离必须服务端强制注入，不能依赖模型填对参数。**

---

## 4. ★ 改写的代价，和"要不要改写"

### 4.1 代价清单

```Plain
每种改写都要多一次（或多次）LLM 调用：
├─ 延迟：+ 数百 ms ~ 数秒   ← ★ 通常比检索本身（几十 ms）贵一个数量级
├─ 成本：按 query 计费
└─ 风险：★ 改写可能把好 query 改坏
```

> ★ 最后一条最容易被忽略。**改写不是单调改进**——"怎么退钱"改写成"退款流程"是变好，但也可能被改写成一段啰嗦的解释，反而稀释了关键信息。

### 4.2 ★ 所以真实系统里要有一道"是否需要改写"的判断

```Plain
不是所有 query 都值得改写：
├─ 简单事实型："退款要几天"        → ★ 直接检索更好，改写是浪费
├─ 精确标识符："ERR_4092 是什么"    → ★ 改写会破坏字面，交给 BM25
├─ 多轮指代："它支持吗"            → ★ 必须改写（否则无法检索）
└─ 复杂多跳："A 和 B 在 X 和 Y 上怎么选" → ★ 必须拆分
```

**判断方式**（由便宜到贵）：

| 方式       | 做法                                         | 成本                            |
| ---------- | -------------------------------------------- | ------------------------------- |
| 规则       | 含指代词 / 含"和""以及" / query 太短 → 改写 | 0                               |
| 小模型分类 | 训一个小分类器判断                           | 低                              |
| LLM 判断   | 让 LLM 自己决定                              | ★ 一次调用（但比改写本身便宜） |

> ★★ **一个重要的工程原则**：既然"判断要不要改写"本身也要花一次 LLM 调用，**那不如直接让它输出改写结果 + 一个置信标记**，一次调用同时做完两件事。
> 更进一步：**先直接检索一次，如果分数够高就跳过改写**——用检索结果反过来决定要不要改写，这比事前判断更可靠、也更省。

> ★ 这个"**先做便宜的事，看结果再决定要不要花贵的那次调用**"的思路，就是 Agent 思维的雏形。
> Phase 1 的 Agent Loop 本质上就是这个模式的一般化。

### 4.3 延迟预算（把改写放进去一起算）

```Plain
Query 改写（LLM）      ~300-2000 ms   ← ★ 新增
Query Embedding        ~20-50 ms
向量检索 + BM25        ~5-20 ms
Rerank 50 条           ~100-300 ms
LLM 生成               ~1-3 s

★ 结论：改写让"检索前"的耗时翻了一个数量级，
  但因为 LLM 生成才是大头，端到端总延迟的增幅通常可接受。
  ★ 真正危险的是【多跳】：每跳都要改写 + 检索 + 生成，会成倍放大。
```

> ★ 这解释了为什么 Agent 场景对检索延迟特别敏感——见 [RAG学习.md](RAG学习.md) 第 12.3 节。

---

## 5. 最小可跑的实现

```Plain
# 伪代码：体现决策而非具体 API

# ---------- 第一步：判断是否需要改写（★ 用规则，零成本） ----------
def need_rewrite(query, history):
    if len(query) < 4:                        return True   # 太短
    if re.search(r'它|这个|那个|上述|前面', query):  return True   # 指代
    if re.search(r'和|以及|与.*区别', query):        return True   # 可能多跳
    return False

# ---------- 第二步：改写（按需选择手法） ----------
def rewrite(query, history, strategy):
    if strategy == "expand":              # Query2doc 式
        pseudo = llm(few_shot_prompt, query)
        return [query, query + " " + pseudo]

    if strategy == "hyde":                # HyDE 式
        fake_doc = llm("写一段能回答这个问题的文档：", query)
        return [fake_doc]                 # ★ 注意用假文档去检索，不是拼接

    if strategy == "decompose":           # Least-to-Most / Self-Ask 式
        return llm("把这个复杂问题拆成几个子问题：", query)   # → [q1, q2, ...]

    return [query]                        # 不改写

# ---------- 第三步：多路召回 ----------
def retrieve_multi(queries):
    results = []
    for q in queries:
        results.append(bm25_search(q))       # 关键词路
        results.append(vector_search(q))     # 向量路
    return results                            # 多路结果列表

# ---------- 第四步：融合 ----------
def fuse(result_lists, method="rrf"):
    if method == "rrf":
        return rrf(result_lists, k=60)       # ★ 默认，免调参
    else:
        return weighted_norm(result_lists)   # ★ 保留置信度，但要调参

# ---------- 第五步：接回原有管线 ----------
candidates = fuse(retrieve_multi(rewrite(query, history, strategy)))
reranked   = rerank(query, candidates, top_k=5)   # ★ rerank 用【原始 query】，不用改写后的
```

**四个不要省的点**：

```Plain
1. ★ 不要对所有 query 都改写 —— 先判断（4.2）
2. ★ Rerank 要用原始 query —— 改写后的 query 用来召回，原始 query 才是真实意图
3. ★ 保留原始 query 一起召回（多路），不要"改写后丢弃原始 query"
4. 记录每次改写前后的 query —— 否则出问题无法归因（见 03 的可观测性）
```

> ★ 第 2 条尤其容易错：改写是为了**让检索器听懂**，rerank 是为了**判断相关性**——后者的判据应该是**用户真正想问什么**。

---

## 6. 什么情况算"这一步做完了"

```Plain
□ 能说清四种改写手法各自解决什么问题、代价是什么
□ ★ 有"是否需要改写"的判断，而不是无脑改写
□ HyDE 的"假文档"和 Query2doc 的"伪文档"能区分清楚
□ 多路召回能跑通，且融合策略选型有理由（RRF 还是加权）
□ ★ Rerank 用的是原始 query（这一点验证过）
□ 用 03 的评测集量化过：改写让 Recall 从 X 到 Y、延迟增加多少
□ 能回答"多跳问题我是拆分还是不拆分，依据是什么"
```

> ★ 最后两条是关键：**改写必须有评测数据支撑**。
> 否则你只是"加了个 LLM 调用"，说不清它到底有没有用——这正是 [03_RAG评估体系.md](03_RAG评估体系.md) 存在的意义。

---

## 7. 参考文献

**本文直接引用的**：

| 论文名                                                                                    | 本文引用点                                       | 找                                         |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------ |
| **Query2doc: Query Expansion with Large Language Models**                           | 查询扩展；伪文档；BM25 提升 3%~15%               | EMNLP 2023 ・ arXiv 2303.07678             |
| **Precise Zero-Shot Dense Retrieval without Relevance Labels**（HyDE）              | ★ HyDE；"dense bottleneck 过滤错误细节"         | ACL 2023 ・ arXiv 2212.10496               |
| **Query Rewriting for Retrieval-Augmented Large Language Models**（RIPOR）          | ★ Rewrite-Retrieve-Read 范式；可训练小 rewriter | EMNLP 2023 ・ arXiv 2305.14283             |
| **Least-to-Most Prompting Enables Complex Reasoning in Large Language Models**      | 子问题拆分；SCAN 99% vs CoT 16%                  | ICLR 2023 ・ arXiv 2205.10625              |
| **Measuring and Narrowing the Compositionality Gap in Language Models**（Self-Ask） | ★ 组合性缺口；模型变大也不缩小；可接搜索引擎    | Findings of EMNLP 2023 ・ arXiv 2210.03350 |

**背景（本文未直接引用，但相关）**：

| 论文名                                                                                       | 用途                 | 找                               |
| -------------------------------------------------------------------------------------------- | -------------------- | -------------------------------- |
| **RAGChecker: A Fine-grained Framework for Diagnosing Retrieval-Augmented Generation** | 判断"是不是检索失败" | NeurIPS 2024 ・ arXiv 2408.08067 |
| **Lost in the Middle: How Language Models Use Long Contexts**                          | 文档位置效应         | TACL 2024                        |

> ⚠️ **一处未核实**：RRF 的原始论文出处我这次没能确认（ACM 站点拒绝访问），所以没有列出。
> 如果你要在论文里引用 RRF，请自行核实原始文献。

**下一篇会用到的（留给 05 生成 prompt 与幻觉抑制）**：

| 论文名                                                                                   | 用途                       | 找                            |
| ---------------------------------------------------------------------------------------- | -------------------------- | ----------------------------- |
| **Self-RAG: Learning to Retrieve, Generate, and Critique through Self-Reflection** | 自我反思式生成、引用标注   | ICLR 2024 ・ arXiv 2310.11511 |
| **Chain-of-Verification Reduces Hallucination in Large Language Models**           | 让模型先列用了哪几段再回答 | arXiv 2309.11495              |

---

## 8. 和别处的关系

```Plain
[RAG学习.md] 第 10 章 检索质量评测 + [03_RAG评估体系.md]
    ↑ 诊断出"检索失败"之后，★ 本文是第一个该试的修复手段
[RAG学习.md] 第 7.1 节 混合检索（BM25 + 向量 + RRF）
    ↑ 本文是它的"前传"：先把 query 弄对，再谈多路融合
[RAG学习.md] 第 8 章 元数据过滤
    ↑ Self-Query（3.3）是它真正落地的方式
[03_RAG评估体系.md] 两类失败诊断
    ↑ 本文处理的是"检索失败"这一类
[agent开发学习路线.md] Phase 0.2
    ↑ 本文对应的路线节点
[agent开发学习路线.md] Phase 1 Agent Loop
    ↑ ★ Self-Ask 的"提问→检索→再提问"就是 Loop 的雏形（见 2.4）
```

> ★ 一句话总结：**改写解决"检索器听不懂用户"，HyDE 解决"query 和文档不像"，拆分解决"一个问题里藏了多个问题"，多路召回解决"改写有可能改坏"。**
> 四者对应的失败模式完全不同，**别把它们当成一个技巧的四种叫法**。
