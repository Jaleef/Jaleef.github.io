---
title: RAG评估体系
description: 
date: 2026-10-14
tags: []
---

# RAG 评估体系（生成侧)

## 1. 为什么生成侧评估比检索侧难得多

### 1.1 检索侧的答案是离散的，生成侧是连续的

检索评估的判据很干脆：**正确的文档在不在返回的 Top-K 里**。

```Plain
检索侧：  "退款流程" → 召回了 [doc_12, doc_45, doc_07] → doc_12 是正确答案？
          ↑ 二值判断，甚至不需要 LLM

生成侧：  "退款要几天？" → "通常 3 个工作日到账，具体取决于支付渠道。"
          ↑ 对了多少？多说了吗？少说了吗？来源标对了吗？
            —— 没有唯一的"正确字符串"
```

RAG 的模块化特性使得**端到端评估无法定位瓶颈**——这正是 RAGChecker 的出发点：他们把评估拆成检索模块和生成模块各自的诊断指标，并验证其在**与人类判断的相关性上显著优于其他评估指标**。

> RAGChecker: A Fine-grained Framework for Diagnosing Retrieval-Augmented Generation

> ★ **一句话**：检索侧回答「找没找到」，生成侧回答「答得好不好」——**后者才是用户感知到的东西**。

### 1.2 两个容易混淆的"幻觉"

```Plain
幻觉 A：检索根本没召回 → 模型用自己的知识瞎编     ← 根因在检索
幻觉 B：检索召回了，但模型没忠实使用              ← 根因在生成
```

**这两类的修复方式完全相反**，而端到端指标会把它们混成一个「答案错了」。

> RAGChecker: A Fine-grained Framework for Diagnosing Retrieval-Augmented Generation

> ★ 论文 RAGChecker 的动机正是这个：区分**检索**和**生成**两个模块的贡献，才能知道该改哪一边。
>
> 这和你 [RAG学习.md](RAG学习.md) 第 13.3 节「两类失败必须分开诊断」是同一件事——**区别是这里给它找到了论文依据**。

---

## 2. 生成侧四指标（及其出处）

### 2.1 RAGAS：无参考评估的开创性工作

RAGAS 的定位是**reference-free**（无需人工标注参考答案）：

> "We introduce RAGAs, a framework for **reference-free evaluation** of RAG pipelines... a suite of metrics that can evaluate these different dimensions **without relying on ground truth human annotations**."
> —— RAGAs: Automated Evaluation of Retrieval Augmented Generation

★ 这句话是全节的基石：**你不需要先写标准答案，只需要有问题**。这直接决定了评估集的构造成本（见第 6 节）。

RAGAS 明确把评估拆成三个维度：

```Plain
① 检索系统能否识别出相关且聚焦的段落   → context relevance
② LLM 能否忠实地利用这些段落           → faithfulness
③ 生成本身的质量                       → answer relevance
```

### 2.2 四个指标对照表

| 指标                                     | 论文原文维度                                                               | 量什么                     | 需要的输入                  |
| ---------------------------------------- | -------------------------------------------------------------------------- | -------------------------- | --------------------------- |
| **Faithfulness**（忠实度）         | "the ability of the LLM to exploit such passages faithfully" | 答案是否只用了检索内容     | 问题 + 答案 + 上下文        |
| **Answer Relevance**（答案相关性） | "the quality of the generation itself"                       | 答案是否切题               | 问题 + 答案                 |
| **Context Precision**              | "identify relevant and focused context passages"             | 检索到的内容里有多少真有用 | 问题 + 上下文               |
| **Context Recall**                 | 同上（覆盖面）                                                             | 该用到的是否都检索到了     | 问题 + 上下文（+ 参考答案） |

> RAGAs: Automated Evaluation of Retrieval Augmented Generation

> ★ **Faithfulness 是其中最重要的一个**，因为它**直接量化幻觉**。
> 你在 [RAG学习.md](RAG学习.md) 的 8A.4 里做的阈值过滤、引用标注、指令与数据分离，全都应该体现在这个数字上。

### 2.3 ★ 一个必须知道的坑：LLM-as-a-judge 的可靠性

RAGAS 用 LLM 当裁判。而 **LLM 裁判本身会犯错**——这是 ARES 论文的核心动机：

> "To mitigate potential prediction errors, ARES utilizes a small set of human-annotated datapoints for **prediction-powered inference (PPI)**."
> —— ARES: An Automated Evaluation Framework for Retrieval-Augmented Generation Systems

ARES 的两个关键做法：

```Plain
① 自己合成训练数据，微调一个轻量 LM 当裁判（而不是直接拿大模型当裁判）
② 用少量人工标注做 PPI，给出置信区间——即"这个分数有多可信"
```

> ARES: An Automated Evaluation Framework for Retrieval-Augmented Generation Systems

> ★★ **对你的直接含义**：
>
> **报告一个 RAGAS 分数时，必须同时说明它是怎么算出来的**——哪一版 LLM 当裁判、prompt 是什么、温度多少。
> 否则「Faithfulness 0.82」这个数字**不可比、不可复现**：换一版裁判模型，分数可能差 0.1。
>
> **"不可复现的指标 = 没有指标"**，和 [RAG学习.md](RAG学习.md) 第 13.4 节说的"没有评测集的调优 = 随机漫步"是同一类错误。

---

## 3. ★★ 两类失败的诊断（本节的骨架）

### 3.1 归因树

```Plain
端到端答案不对
    │
    ├─ 先测：正确文档有没有被召回？（Context Recall / Recall@K）
    │
    ├─ 没有 → 【检索失败】
    │     去查：文档解析 → Chunking → 索引 → 混合检索 → Query 改写 → Rerank
    │     ↑ 见 RAG学习.md 第 4A / 5 / 6 / 7 章
    │
    └─ 召回了 → 再测：答案是否忠实于这些文档？（Faithfulness）
           │
           ├─ 低 → 【生成失败：不忠实】→ 改 上下文组装 / prompt
           │        ↑ 见 RAG学习.md 第 8A 章
           │
           └─ 高但答案仍不对 → 【生成失败：其他】
                    Answer Relevance 低  → 没答到点上（prompt / 模型能力）
                    两者都高但人觉得错 → ★ 可能是评测集本身有问题
```

> ★ 注意最后一行：**当所有指标都很漂亮但答案就是错，先怀疑你的评测集，不要怀疑模型**。

### 3.2 症状对照表

| 症状                       | Context Recall | Faithfulness | Answer Relevance | 归因                          |
| -------------------------- | -------------- | ------------ | ---------------- | ----------------------------- |
| 答不出，说"资料中没有"     | **低**   | 高           | 中               | 检索失败                      |
| 答得很流畅但是编的         | 低             | **低** | 高               | 检索失败 → 导致幻觉          |
| 资料在，但答案用了外部知识 | 高             | **低** | 高               | 生成失败（prompt 未约束）     |
| 资料在，答案答非所问       | 高             | 高           | **低**     | 生成失败（prompt / 模型）     |
| 全高但人工判错             | 高             | 高           | 高               | ★**评测集/裁判有问题** |

### 3.3 ★ 一个不用写代码的快速判别法

**把"你确信正确的那段原文"直接贴进 prompt，再问一次**：

```Plain
答对了 → 模型能力没问题，是检索/组装没把资料喂进去   → 检索失败
还是错 → 资料给到了它也答不对                        → 生成失败
```

> ★ 这个手工实验的价值在于**它只需要 2 分钟**，而跑一套 RAGAS 需要写代码 + 花钱。
> **先用 2 分钟做粗筛，再用 RAGAS 做精确定位**——这和你笔记里「用便宜的方法粗筛、昂贵的方法精排」是同一个思想。

### 3.4 RAGChecker：把归因做得更细

RAGChecker 提供了覆盖检索与生成两个模块的**一整套诊断指标**，并用「元评估」（meta evaluation）验证了**它比现有其他指标与人类判断的相关性显著更高**。

它更进一步的价值是：论文用它评估了 8 个 RAG 系统，**揭示出 RAG 架构设计中的权衡模式**。

> RAGChecker: A Fine-grained Framework for Diagnosing Retrieval-Augmented Generation


> ★ 对你的含义：**如果你要写论文，RAGChecker 的"元评估"思路值得抄**——即"我提出的指标比现有指标更接近人类判断"，用相关性数字证明，而不是自己说好。

---

## 4. 除此之外，还有一类评估你可能没想到：鲁棒性

前面的指标都是「正常情况下答得好不好」。RGB 论文指出还有 4 种**基础能力**必须单独测：

```Plain
① Noise Robustness        噪声鲁棒性   —— 检索里混了无关文档，还能答对吗
② Negative Rejection      拒答能力     —— 检索结果里没有答案时，能说"不知道"吗
③ Information Integration 信息整合     —— 答案分散在多篇文档里，能综合吗
④ Counterfactual Robustness 反事实鲁棒 —— 检索到的是错信息，能识别吗
```

★ **RGB 的实测结论很值得记住**：

> "while LLMs exhibit a certain degree of **noise robustness**, they still struggle significantly in terms of **negative rejection, information integration, and dealing with false information**."
> —— Benchmarking Large Language Models in Retrieval-Augmented Generation

**翻译成工程语言**：

```Plain
模型比较能扛"噪声"（多召回几条无关的，通常还行）
但明显不擅长：
  ├─ 拒答    → 所以「检索不到必须显式返回」是必需的，不是优化项 ★
  ├─ 信息整合 → 所以多跳问题 / 跨文档问题要专门测
  └─ 识别错误信息 → 所以你的知识库里如果有错误内容，模型很可能照单全收
```

> ★★ **第 ② 条直接给你 [RAG学习.md](RAG学习.md) 第 12.4 节「必须有明确的检索不到信号」提供了论文支撑**：
> 模型**天然不擅长拒答**，所以"检索不到"这个信号**必须由系统显式提供**，不能指望模型自己判断。

---

## 5. 评估方法的三个层次（把前面都串起来）

| 层次             | 测什么                          | 要不要 LLM | 成本 | 出处                             |
| ---------------- | ------------------------------- | ---------- | ---- | -------------------------------- |
| **索引层** | 索引快不快、全不全              | 不要       | 极低 | [RAG学习.md](RAG学习.md) 3.5      |
| **检索层** | Recall@K / MRR / NDCG           | 不要       | 低   | [RAG学习.md](RAG学习.md) 第 10 章 |
| **生成层** | Faithfulness / Answer Relevance | ★ 要      | 高   |        |

**为什么要分层**：因为**调试代价差了几个数量级**。检索层可以跑一千次，生成层跑十次就心疼。所以**调参永远先在便宜的那层做**。

> ★ 这个分层不是论文提出的，是工程实践总结。但 RAGChecker 把评估拆成检索/生成两套指标的做法，方向上是一致的。

---

## 6. 怎么构造评测集

### 6.1 RAGAS 的"无参考"意味着什么

因为 RAGAS 是 reference-free 的，你的评测集**不需要写标准答案**：

```Plain
❌ 传统做法（贵）：
   { 问题, 标准答案, 正确文档 id }

✅ RAGAS 做法（便宜）：
   { 问题 }                          ← 只测 Faithfulness / Answer Relevance
   { 问题, 正确文档 id }              ← 加上这个可以额外测 Context Recall

★ 注意：Context Recall 仍然需要"正确文档"这个标注，
  所以「完全不要人工标注」是不准确的 —— 论文说的是不需要"ground truth 答案"
```

> ★ **这是一个容易读错的点**：RAGAS 省掉的是**写答案**，不是**标来源**。
> 而 [RAG学习.md](RAG学习.md) 第 10.1 节说的 `(问题, 正确答案所在的文档/chunk)` 正是后者——**所以两份笔记在这里是互补的，不是重复的**。

### 6.2 规模与来源

```Plain
规模：30~100 条（先跑通，不要追求大）
来源优先级：
  ① ★ 真实用户问题（最值钱，但你可能还没有）
  ② 从你的文档里反向构造问题（读一段 → 出题）
  ③ 让 LLM 生成（快，但要注意覆盖面偏差）

★ 第 ③ 条的坑 [工程推论]：
  LLM 生成的问题往往"太好检索"——
  因为它倾向于用文档里出现过的词提问，而真实用户不会。
  这会让你的 Recall 虚高。
```

### 6.3 ★ 失败样本集：比评测集更值钱

**这个论文里没有，是我强烈建议你做的**：

```Plain
维护一份单独的失败样本集，格式：
  问题 | 期望答案 | 实际检索到了什么 | 归因(检索/生成) | 修复方式

为什么它比评测集值钱：
├─ 评测集是"抽样"，失败样本集是"真实痛点"
├─ 每修好一条 = 一次可复现的进步
├─ 会暴露你想象不到的问题类型（多版本冲突、格式串台…）
└─ ★ 面试/汇报时，"我收集了 40 个失败 case 并逐个归因"
      比"我调了很久"有说服力得多
```

---

## 7. 最小可跑的实现

```Plain
# 伪代码：体现流程而非具体 API

# ---------- 第 1 步：评测集（不需要标准答案，但需要正确来源） ----------
eval_set = [
    {"q": "退款要几天到账？", "gold_doc": "手册.pdf#p12"},
    ...   # 30~100 条
]

# ---------- 第 2 步：跑一遍系统，把所有中间产物存下来 ----------
for case in eval_set:
    trace = rag_pipeline(case.q)        # ★ 存全链路，不只存答案
    save({
        "q":           case.q,
        "retrieved":   trace.retrieved,      # 召回了什么 + 分数
        "context":     trace.assembled,      # 真正喂给 LLM 的那段
        "answer":      trace.answer,
        "gold_doc":    case.gold_doc,
    })
# ★ 没有 trace 就没法归因 —— 这就是"可观测性优先"的原因

# ---------- 第 3 步：算检索层指标（免费，可以反复跑） ----------
recall_at_k = compute_recall(traces, k=5)
mrr         = compute_mrr(traces)
# → 低 → 检索失败，去改解析/chunking/检索，先别看生成侧

# ---------- 第 4 步：算生成层指标（要花钱，跑一次就够） ----------
report = ragas.evaluate(
    traces,
    metrics=[faithfulness, answer_relevance, context_precision, context_recall],
)
# ★ 必须同时记录：裁判模型版本 + prompt + 温度，否则数字不可复现

# ---------- 第 5 步：归因，按第 3 节的归因树分类 ----------
for case in traces:
    case.attribution = classify(
        ctx_recall = case.context_recall,
        faithful   = case.faithfulness,
    )

# ---------- 第 6 步：按归因分组看，而不是只看总分 ----------
group_by_attribution(report)
# ★ 关键：不要只看"平均 Faithfulness 0.82"，
#   要看"20 条检索失败 + 5 条生成失败"，后者才是可操作的信息
```

**四个不要省的点**：

```Plain
1. 不要只存答案 —— 必须存 trace（检索到什么、组装成什么）
2. 不要只报总分 —— 必须按"检索失败/生成失败"分组
3. 不要忘了记裁判配置 —— 否则分数不可复现、不可比
4. 不要跳过检索层直接测生成层 —— 贵，且无法归因
```

---

## 8. 什么情况算"这一步做完了"

```Plain
□ 有一份 30~100 条的评测集（含"正确来源"标注）
□ 检索层指标能一键重跑（免费、快）
□ 生成层四指标能跑出来（Faithfulness / Answer Relevance / Context Precision / Context Recall）
□ ★ 每个分数都记录了裁判模型 + prompt 版本
□ ★ 能对每个失败 case 给出"检索失败 / 生成失败"的归因
□ 有一份独立的失败样本集，且在持续维护
□ 改任何一环后，能跑回归确认没把别的改坏
□ ★ 能回答"我这次改动让 Recall 从 X 到 Y、Faithfulness 从 X 到 Y"
```

> 最后一条是 [agent开发学习路线.md](agent开发学习路线.md) 里 Phase 0 的出口标准原话。

---

## 9. 参考文献

**本文直接引用的**：

| 论文名 | 本文引用点 | 找 |
| --- | --- | --- |
| **RAGAs: Automated Evaluation of Retrieval Augmented Generation** | ★ 核心：无参考评估、三维度拆分、四指标 | EACL 2024 ・ arXiv 2309.15217 |
| **ARES: An Automated Evaluation Framework for Retrieval-Augmented Generation Systems** | LLM 裁判的误差、PPI 置信区间、微调轻量裁判 | NAACL 2024 ・ arXiv 2311.09476 |
| **RAGChecker: A Fine-grained Framework for Diagnosing Retrieval-Augmented Generation** | 检索/生成分模块诊断；元评估证明更接近人类判断 | NeurIPS 2024 ・ arXiv 2408.08067 |
| **Benchmarking Large Language Models in Retrieval-Augmented Generation**（RGB） | ★ 4 种基础能力；模型不擅长拒答/信息整合 | AAAI 2024 ・ DOI 10.1609/aaai.v38i16.29728 |

**背景（本文未直接引用，但应知道）**：

| 论文名 | 用途 | 找 |
| --- | --- | --- |
| **Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks** | ★ RAG 的原始论文 | NeurIPS 2020 |
| **Retrieval-Augmented Generation for Large Language Models: A Survey** | 综述；Naive / Advanced / Modular 三范式 | arXiv 2312.10997 |
| **Lost in the Middle: How Language Models Use Long Contexts** | 支撑 [RAG学习.md](RAG学习.md) 8A.3 的位置效应结论 | TACL 2024 |

**下一篇会用到的（留给 04 Query 改写）**：

| 论文名 | 用途 |
| --- | --- |
| **Precise Zero-Shot Dense Retrieval without Relevance Labels** | HyDE |
| **Query2doc: Query Expansion with Large Language Models** | 查询扩展 |

## 10. 和别处的关系

```Plain
[RAG学习.md] 第 10 章 检索质量评测
    ↓ 解决"检索怎么测"（Recall@K / MRR / NDCG，不要 LLM）
本节（03 RAG 评估体系）
    ↓ 解决"生成怎么测 + 失败了怎么归因"
[RAG学习.md] 第 13 章
    ↑ 本文是它的展开版（含论文出处）；13 章保留作为速查
[RAG学习.md] 第 14.1 节 可观测性
    ↑ ★ 前置条件：没有 trace，本文第 3 节的归因根本做不了
[agent开发学习路线.md] Phase 0.1
    ↑ 本文对应的路线节点
```

> ★ 一句话总结：**检索侧指标告诉你「找没找到」，生成侧指标告诉你「答得好不好」，而归因方法论告诉你「该去改哪一行代码」。**
> 三者缺一，你就在随机漫步。
