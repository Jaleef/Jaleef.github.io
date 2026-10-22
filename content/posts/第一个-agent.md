---
title: 第一个 Agent
description: 
date: 2026-10-22
tags: []
---

# 徒手写出第一个 Agent（Agent Loop 与工具设计）

> **不依赖任何框架**，用熟悉的语言 + 一个 LLM API，写出一个能多步完成任务的 Agent。
>
> ★ 这是 [00_agent开发学习路线.md](00_agent开发学习路线.md) 的 **Phase 1**，也是 [08_搭桥实验.md](08_搭桥实验.md) 里那个 150 行 loop 的**正式展开版**。
>
> **为什么必须徒手写**：你后面要用框架，但**只有徒手写过，你才知道框架帮你做了什么、在哪一层挡住了你**。这一步的产出不到 300 行，但它决定了你之后是「会用框架的人」还是「理解框架的人」。

> **引用说明**：结论下方用 `>` 或 `> ——` 标出论文名。**没标论文的地方是我自己的工程推论**。

---

## 0. 产出什么

```Plain
代码产出：
├─ 一个 < 300 行、无框架、可运行的 Agent
├─ 至少 3 个工具（文件读写 / shell 或代码执行 / 你的 RAG 检索）
└─ 两版：ReAct 版（理解原理）+ Function Calling 版（生产形态）

认知产出（★ 比代码更重要）：
├─ 能说清 Loop 的七个边界条件分别对应什么失败
├─ ★ 能说清「自我纠错」到底靠什么机制（第 1.3 节）
├─ 能说清「框架帮我做了什么」这份清单
└─ ★ 亲眼看到上下文爆炸（跑长任务，token 一直涨）
```

**预计耗时**：3~5 天。其中**写代码 1~2 天，调试边界条件 2~3 天**。

> ★ 提前说：**你会觉得写 Loop 只用半天，然后调各种边界条件用掉一周。这是正常的。**
> 因为 Loop 本身只有 5 行，剩下的全是"出错了怎么办"。

---

## 1. Agent Loop 到底是什么

### 1.1 最小循环（5 行）

```Plain
messages = [system, user]

while True:
    response = LLM(messages, tools=[...])      # ① 调用模型

    if response.has_tool_calls:                # ② 有工具调用？
        messages.append(response)              #    把 assistant 消息存回历史
        for call in response.tool_calls:       # ③ 执行工具
            result = execute(call)
            messages.append(tool_result(call.id, result))   # ★ 结果必须带 id 回填
        continue                               # ④ 回到 ①，让模型看结果
    else:
        return response.text                   # ⑤ 没有工具调用 = 结束
```

**这个循环的来历**：它不是凭空设计的，而是把 ReAct 论文的思想工程化。论文的核心做法是让模型**交替生成推理轨迹和任务动作**，并指出这样做的价值：

> **推理轨迹帮助模型归纳、跟踪和更新行动计划，并处理异常（handle exceptions）；而行动让模型能与外部源（如知识库或环境）交互，以获取额外信息。**

> —— ReAct: Synergizing Reasoning and Acting in Language Models

> ★ 注意那两个并列的作用：**"更新计划" + "处理异常"**。
> 上面的 5 行循环只实现了"更新计划"（继续下一轮）；**"处理异常"需要你在 ③ 里显式设计**——这就是下面七个坑里的第 2、3 条。

### 1.2 ★ 七个边界条件（这一节是真实工作量）

Loop 的 5 行写起来是半天，下面七条吃掉了剩下的时间。

| # | 问题 | 必须想清楚什么 | 后果 |
|---|---|---|---|
| 1 | **什么时候结束** | 模型不调工具 ≠ 任务完成（它可能只是**放弃了**） | 任务没做完却报告成功 |
| 2 | **工具报错怎么办** | 异常必须**回填给模型**，而不是让你的程序崩 | 一次报错就整个任务挂掉 |
| 3 | **调了不存在的工具** | 回填错误信息，别崩 | 同上 |
| 4 | **一次返回多个工具调用** | 能不能并行？哪些能并行（读），哪些必须串行（写同一文件）？ | 并发写坏文件 / 无谓串行变慢 |
| 5 | **工具结果太大** | 必须截断，**且要告诉模型"已截断"** | 上下文被一次 `cat` 塞爆 |
| 6 | **死循环** | 反复调同一个工具、同一个参数 | 烧钱、超时 |
| 7 | **上下文一直增长** | 这是 Phase 2 的全部内容。**这里先让它暴露出来** | 跑 20 轮后开始答非所问 |

> ★★ **最重要的认知**：**Loop 本身很简单，难的是 Loop 外面的东西。**
>
> 你写完这 200 行会有一种"就这？"的感觉——**对了，Loop 就是"就这"。**
> 工业级 harness 和这 200 行的区别，99% 在循环**之外**：上下文怎么管、权限怎么划、状态怎么存、出错怎么恢复。那就是 Phase 2。

### 1.3 ★★ 一个必须先想清楚的事：「自我纠错」靠什么

[00_agent开发学习路线.md](00_agent开发学习路线.md) 的出口标准要求：**"它能自己规划、自己纠错、自己判断完成"**。

"自己纠错"听起来像"让模型再想想"。**但论文说不是。**

#### 论文的结论：没有外部反馈，自我纠错不成立

有一篇论文专门检验了这件事，它定义了一个概念叫**内在自我纠错（intrinsic self-correction）**——即**仅依靠模型自身能力、不借助外部反馈**来纠正初始回答。

> 在推理任务的语境下，我们的研究表明：**LLM 在没有外部反馈的情况下难以自我纠正其回答，有时自我纠正后表现甚至会下降。**

> —— Large Language Models Cannot Self-Correct Reasoning Yet

> ★★ **"有时表现甚至会下降"** —— 这句话很重要。
> 它意味着"让它再检查一遍"这个动作**不是中性的**，它可能主动把对的改成错的。

#### 那 Agent 为什么还能纠错？因为工具给了它外部反馈

回头看 ReAct 论文的那句话——推理轨迹的作用之一是**"处理异常"**，而**行动**让模型能与外部源交互**获取额外信息**。

> —— ReAct: Synergizing Reasoning and Acting in Language Models

把两篇论文放在一起看，结论就出来了：

```Plain
❌ 错误理解：
   Agent 能自我纠错 = 模型很聪明，会反思

✅ 正确理解：
   Agent 能自我纠错 = ★ 工具返回了客观的、它无法自欺的反馈
                        ↓
                    代码跑出了报错 / 检索返回"没找到" / 测试没通过
                        ↓
                    模型被迫面对现实，然后调整
```

> ★★ **所以 1.2 表里的第 2 条（"工具报错必须回填给模型"）不是一个易用性优化，
> 它是整个 Loop 里唯一能让"自我纠错"成立的机制。**
>
> 如果你把异常直接 `raise` 掉、或者把错误吞掉返回空，**你的 Agent 就永远失去了纠错能力**——
> 它只能凭猜测继续，然后在错误的路上越走越远。

#### 这也解释了 Reflexion 为什么有效，以及它的前提

Reflexion 是把"反思"做成机制的代表工作。它的做法很特别：

> Reflexion **不通过更新权重、而是通过语言反馈来强化语言 agent**。具体来说，Reflexion agent 对任务反馈信号进行言语反思，然后把反思文本保存在一个**情景记忆缓冲区**中，以便在后续尝试中做出更好的决策。

> —— Reflexion: Language Agents with Verbal Reinforcement Learning

它的实测成绩很亮眼：在 HumanEval 上达到 **91% pass@1**，超过此前 SOTA 的 GPT-4 的 **80%**。

> —— Reflexion: Language Agents with Verbal Reinforcement Learning

> ★ 但请注意一个**前提**：它能反思，是因为**"任务反馈信号"存在**（论文说的是标量值或自由文本，外部或内部模拟的）。
> **代码题有测试用例，所以有干净的对错信号。**
>
> ★★ **如果你的任务是"写一份报告"，你没有这个信号——那 Reflexion 那套就不直接适用。**
> 这是你在借鉴它时必须自己判断的地方。

#### 给你的落地建议

```Plain
现在（Phase 1）：不要做 Reflexion
├─ 它是"多次尝试 + 记忆反思"，属于进阶
├─ ★ 你先把【单次 Loop + 错误回填】做扎实
└─ 因为错误回填是 Reflexion 的地基，地基没有，反思是空转

具体做三件事就够：
① 工具异常 → 包成结构化错误 → 回填（别 raise）
② 工具返回"没找到" → 明确告诉模型"没找到 + 分数"
③ ★ 在 system prompt 里明确："遇到错误请换一种方式再试"
```

> ★ 第 ③ 条的作用不是"求模型反思"，而是**告诉它外部反馈是可用的、并且鼓励它使用**。
> 这和第 1.3 节的逻辑一致：**纠错来自反馈，而反馈需要被引导去使用**。

---

## 2. 工具设计（Tool Design）

**这是 Agent 开发里最像"手艺"的部分**，也是你 Phase 0 的检索工具要升级的地方。

### 2.1 一个工具必须回答的六件事

```Plain
1. 名字与描述   —— 模型只靠这段文字决定要不要用、怎么用
2. 参数 schema  —— 类型、必填、枚举、范围（★ 枚举比自由文本可靠得多）
3. 参数含义     —— 「top_k 取多少」比「top_k: number」有用一万倍
4. 返回结构     —— 稳定、可解析、带状态
5. 失败语义     —— 失败要说清是「参数错了」还是「查不到」还是「系统故障」
6. 输出预算     —— 最多返回多少，超了怎么截断
```

### 2.2 工具调用的本质：模型要学会四件事

Toolformer 是第一篇把"模型自己决定用工具"系统化的工作，它把这件事拆得很清楚——模型需要学会：

> **决定调用哪些 API、何时调用它们、传什么参数、以及如何最好地把结果纳入后续的 token 预测。**

> —— Toolformer: Language Models Can Teach Themselves to Use Tools

```Plain
① which  —— 该不该用工具、用哪个      → ★ 靠"描述"，工具的 description
② when   —— 什么时候用                → ★ 靠系统提示 + 上下文
③ what args —— 传什么参数             → ★ 靠 schema + 参数说明
④ how to use the result —— 怎么用结果  → ★ 靠"返回结构"的设计
```

> ★★ **第 ④ 条最容易被忽略**。
> 很多人只关心"模型能不能调对工具"，却不管**返回结果长什么样**。
> 但模型要用结果做判断，**返回结构的设计直接决定了它的判断质量**——这正是下一条"查不到必须显式返回"的原因。

### 2.3 三条硬经验

#### ① 工具描述的质量 = 模型的准确率

```Plain
❌ "读文件"
✅ "读取指定路径的文件并返回内容；路径必须是绝对路径；
    如需读取大文件的片段，用 offset/limit（从 0 开始的行号）"
   —— 后者准确率天差地别
```

#### ② ★ "查不到"必须是明确的、可区分的返回值

```Plain
❌ 返回 []
   → 模型不知道是"没找到"还是"系统坏了"

✅ 返回 { found: false, reason: "no_match", top_score: 0.31 }
   → 模型能判断"证据不足"，然后①改写重试 或 ②回答"资料中没有"
```

> ★ 这是你 [RAG学习.md](RAG学习.md) 12.4「必须有检索不到的信号」的**工具化落地**。
> 在 RAG 管线里它是"组装时过滤"，在 Agent 里它变成**工具的契约**——**这是同一件事在两层架构里的形态**。

#### ③ 工具要"少而清晰"，不要"多而含糊"

```Plain
10 个含糊的工具 < 4 个边界清晰的工具

★ 工具一多，模型的选择准确率会下降（且 token 成本上升）
```

> ★ 关于工具数量的规模问题，可以看 ToolLLM 这条线：它面向 **16000+ 真实 API**，为此专门设计了 **API retriever** 来从海量 API 中检索候选，而不是把所有 API 都塞进上下文。

> —— ToolLLM: Facilitating Large Language Models to Master 16000+ Real-world APIs

> ★ **它的启示不是"你也要做 API retriever"，而是"工具多到一定程度，选工具本身就变成一个检索问题"**。
> 你现在只有 3~5 个工具，**用清晰描述就够，不要过度设计**。

### 2.4 工具返回值的设计（一个可直接抄的结构）

```Plain
{
  "status": "ok" | "empty" | "error" | "truncated",
  "data":   <真正的载荷，结构稳定>,
  "meta": {
      "truncated": true/false,      # ★ 是否被截断
      "total_size": 12345,           # ★ 原始大小，让模型知道漏了多少
      "elapsed_ms": 42
  },
  "hint":  "结果已截断，只返回前 2000 字；如需更多请用 offset 分段读取"   # ★ 给模型的建议
}
```

> ★ **`hint` 字段是本节的私货**，但很有用：它让"工具的设计者"能直接指导"模型的下一步动作"，
> 比让模型自己从错误信息里猜要高效得多。

---

## 3. ReAct vs Native Function Calling

### 3.1 差异

| | ReAct（提示词驱动） | Native Function Calling |
|---|---|---|
| 怎么触发工具 | 让模型输出特定文本格式（`Thought:` / `Action:`），再**解析字符串** | API 原生返回结构化的 `tool_calls` |
| 可靠性 | ⚠️ **依赖文本解析，脆弱** | 结构化，稳定 |
| 参数类型 | 自己从文本里抠，容易错 | 有 schema 约束 |
| 今日地位 | 教学价值高 | ★ **生产默认** |

### 3.2 为什么后者成了主流

```Plain
ReAct 的形式：
   Thought: 我需要查一下退款政策
   Action: search_kb("退款政策")
   Observation: ...
        ↓
★ 你要写正则去解析这几行文本
   → 模型多打一个冒号、换个说法、加个 markdown 代码块，你的解析就崩

Function Calling 的形式：
   { "tool_calls": [ { "name": "search_kb",
                       "arguments": "{\"query\": \"退款政策\"}" } ] }
        ↓
★ 结构化字段，不需要猜
```

> ★ **这不是"技术演进"，而是"把不可靠的文本解析换成了契约"。**
> 面试里能这么讲，比背"ReAct 是 2022 年的、Function Calling 是 2023 年的"有说服力得多。

### 3.3 建议：两种都实现一遍，各半天

```Plain
先写 ReAct 版：
├─ 你会亲手实现"解析模型输出 → 执行 → 拼回文本"
├─ ★ 然后彻底明白：Agent = 一个 while 循环 + 一个文本协议
└─ 也会亲手体会"解析有多脆"

再写 Function Calling 版：
├─ 你会发现核心循环【一行都没变】
├─ 变的只是"读结构化字段"替代"正则解析"
└─ ★ 这时你才真正理解：框架帮你做的，就是这层适配
```

> ★ 这两个版本的**代码差异应该小于 20 行**。如果你写出来差异很大，说明你的 ReAct 版写歪了。

---

## 4. ★ 你已有的知识在这里全部会复用

| 你已学的 | 在 Agent 里的用途 |
|---|---|
| **向量检索 → 工具** | 知识库检索 = Agent 的一个工具（[RAG学习.md](RAG学习.md) 第 12 章） |
| **向量检索 → 长期记忆** | 对话历史向量化 = 记忆系统（[RAG学习.md](RAG学习.md) 12.5） |
| **元数据过滤** | 检索工具的 `filter` 参数；**多租户铁律：服务端强制注入，不信模型填的参数** |
| **Rerank top_k** | 工具内部裁剪——★「给模型看多少」和「工具往对话里塞多少」是**两个不同的 top_k**，后者更小 |
| **阈值过滤** | 工具返回"低于阈值 → 明确说没找到"（见 2.3 ②） |
| **上下文组装** | 工具结果的呈现格式（边界、来源、分数） |
| **HNSW efSearch 可在线调** | 多跳检索对延迟敏感 → 这个旋钮有直接工程价值 |
| **Prompt Injection 认知** | ★ 工具结果同样是**不可信输入**（网页、文件内容都可能是攻击载荷） |
| ★ **08 的实验数据** | 你已知"多一次检索要花多少钱、多少延迟"→ 这是你设计工具预算的依据 |

> ★ 看到这张表你应该有底气：**你已经学了 Agent 里最难自学的部分（检索与上下文），剩下的是工程。**
> 检索是很多人做 Agent 时的短板，而它是你的长板。
>
> ★ 特别注意最后一条：**你比大多数初学 Agent 的人多一个东西——你量过成本。**
> 所以你在设计"要不要多搜一次"时，是有数字支撑的，不是凭感觉。

---

## 5. 终止条件：什么时候算完成

这是 1.2 表里的第 1 条，但它值得单独一节——因为**它决定了你的 Agent 是"能用"还是"会骗你"**。

### 5.1 三种终止策略，别只用一种

```Plain
① 模型不调工具 → 结束
   ★ 最常用，但有致命缺陷：模型可能只是【放弃了】

② 达到最大轮数 → 强制结束
   ★ 兜底必备，但会"截断"一个本来能完成的任务

③ ★ 显式"完成"工具 → 结束
   让模型主动调用 finish(result="...")
   → 这会把"我完成了"变成一个【显式动作】，而不是"它没再说话"
```

### 5.2 ★ 推荐：② + ③ 组合，① 作为兜底

```Plain
while turn < MAX_TURNS:
    resp = LLM(messages, tools=TOOLS + [finish])

    if resp.called("finish"):
        return resp.args["result"]          # ★ 显式宣告完成

    if not resp.has_tool_calls:
        # ★ 模型"不说话了" —— 这可能是完成，也可能是放弃
        #   ★ 关键：把它当作"未显式完成"，而不是"成功"
        return {"status": "unconfirmed", "text": resp.text}

    ...执行工具...

# 撞上限
return {"status": "hit_max_turns", "text": "已达最大轮数"}
```

> ★★ **为什么要把"没再说话"标成 `unconfirmed`？**
> 因为你在 [08_搭桥实验.md](08_搭桥实验.md) 6.1 里统计过 `path`——**如果你不区分"显式完成"和"静默结束"，你就无法诊断 Agent 是真的完成了，还是在放弃**。
>
> 这个区分在 Phase 2 会变成"任务成功率"这个核心指标的基础。

### 5.3 「自己判断完成」的三种实现档次

```Plain
档次 1（最弱）：模型不调工具就算完
档次 2（推荐）：有 finish 工具，模型显式宣告
档次 3（进阶）：★ 完成前先自检——"任务要求的每一项都满足了吗？"
               ← 这就是 Reflexion / CoVe 的思路（见 [05] 第 5 节）
               ★ Phase 1 不需要做，知道有这一档即可
```

---

## 6. 最小可跑的实现

### 6.1 骨架（Function Calling 版）

```Plain
# 伪代码：体现边界条件而非具体 API

TOOLS = [read_file, write_file, run_shell, search_kb, finish]

def run_agent(task, max_turns=15):
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},   # ★ 见 6.2
        {"role": "user",   "content": task},
    ]
    seen_calls = []          # ★ 用于死循环检测

    for turn in range(max_turns):
        resp = llm(messages, tools=TOOLS, temperature=0)

        # ---------- 终止：显式完成 ----------
        for tc in resp.tool_calls:
            if tc.name == "finish":
                return {"status": "done", "text": tc.args["result"]}

        # ---------- 终止：静默结束（★ 标为 unconfirmed） ----------
        if not resp.tool_calls:
            return {"status": "unconfirmed", "text": resp.text}

        messages.append(resp)                       # ① 存 assistant 消息

        # ---------- 执行工具 ----------
        for tc in resp.tool_calls:
            # ★ 死循环检测：同工具 + 同参数，连续出现 3 次
            key = (tc.name, json.dumps(tc.args, sort_keys=True))
            seen_calls.append(key)
            if seen_calls.count(key) >= 3:
                result = err("repeated_call",
                             "你已经用相同参数调用过这个工具 3 次，请换一个做法")
            else:
                result = safe_execute(tc)           # ★ 永不让异常逃出去

            messages.append(tool_result(tc.id, result))   # ★ 必须带 id

    return {"status": "hit_max_turns", "text": "已达最大轮数"}


def safe_execute(tc):
    """★ 所有失败都变成结构化返回值，绝不 raise"""
    # ① 工具不存在
    if tc.name not in HANDLERS:
        return err("unknown_tool", f"没有名为 {tc.name} 的工具",
                   hint=f"可用工具：{names(HANDLERS)}")
    try:
        # ② 参数校验
        args = validate(tc.args, SCHEMAS[tc.name])
        # ③ 执行 + 截断
        raw = HANDLERS[tc.name](**args)
        return truncate(raw, budget=2000)       # ★ 见 6.3
    except ParamError as e:
        return err("bad_params", str(e))        # ★ 参数错了 → 让它改参数
    except Exception as e:
        return err("tool_error", f"{type(e).__name__}: {e}")
                                                  # ★ 系统故障 → 让它换个做法
```

> ★ 注意 `err()` 的三处调用分别对应三种失败语义：**工具不存在 / 参数错了 / 系统故障**。
> 模型看到不同的 `reason` 会做不同的事——**这就是 2.1 里"失败语义"的实际价值**。

### 6.2 System Prompt 要写清什么

```Plain
必须明确告诉模型（这些都不是暗示，是事实陈述）：

① 你的目标：<任务描述>
② 你可用的工具及其边界（★ 工具定义里已含，prompt 里不重复）
③ ★ 遇到错误怎么办：换一种方式重试，不要重复同样的调用
④ ★ 什么时候算完成：所有要求都满足后调用 finish
⑤ ★ 什么情况下该说"做不到"：工具确实无法完成时，直接说明，不要硬编
```

> ★ 第 ⑤ 条是 [05_生成prompt与幻觉抑制.md](05_生成prompt与幻觉抑制.md) 2.1 的延续：
> **模型天然不擅长拒答**，所以"允许失败"必须被显式授权，否则它会编一个成功。

### 6.3 结果截断：必须告诉模型

```Plain
def truncate(raw, budget=2000):
    text = str(raw)
    if len(text) <= budget:
        return {"status": "ok", "data": raw}
    return {
        "status": "truncated",
        "data": text[:budget],
        "meta": {"total_size": len(text), "returned": budget},
        # ★ 下面这句是本节的关键
        "hint": f"结果已截断：原文 {len(text)} 字，只返回前 {budget} 字。"
                f"如需后面的内容，请用 offset={budget} 再读一次。"
    }
```

> ★★ **截断不是"少给点"，而是"告诉它少了什么、以及怎么拿到剩下的"**。
> 只截断不告知 → 模型以为自己看到了全部 → **基于不完整信息做决策**（这比报错更危险，因为它不报错）。

---

## 7. 出口验收（对照路线 1.5）

```Plain
代码层
□ 一个 < 300 行、无框架、可运行的 Agent
□ 至少 3 个工具（文件读写 / shell 或代码执行 / RAG 检索）
□ 能完成一个需要 3 步以上、且中间需要自我纠错的任务
□ ★ 工具报错时不崩，能把错误反馈给模型并让它换个做法
□ ★ 结果被截断时，模型知道自己看到的不是全部
□ ★ 死循环能被打断（同一调用重复 3 次触发警告）

认知层
□ 能说清七个边界条件分别对应什么失败
□ ★★ 能说清「自我纠错靠外部反馈，不靠模型反思」
□ ★ 能说清「框架帮我做了什么」——这份清单要写进笔记
□ ★ 亲眼看到上下文爆炸：跑长任务，token 一直涨，并且观察到
     「从第 N 轮开始它开始答非所问」
```

**「框架帮我做了什么」这份清单（写进你自己的笔记）**：

```Plain
我建议你按这五项对照：
├─ 消息协议适配（不同 provider 的 tool_calls 格式）
├─ 并行工具调用的调度（哪些安全、哪些独占）
├─ 错误与重试的统一封装
├─ 上下文压缩（★ 你会发现这是最缺的）
└─ 流式输出与中断
★ 你写得越痛苦的那项，就是框架价值最大的那项
```

---

## 8. 参考文献

**本文直接引用的**：

| 论文名 | 本文引用点 | 找 |
|---|---|---|
| **ReAct: Synergizing Reasoning and Acting in Language Models** | ★★ Loop 的思想来源；推理与行动交替；**"处理异常"**；HotpotQA/Fever 上缓解幻觉与错误传播 | ICLR 2023 ・ arXiv 2210.03629 |
| **Large Language Models Cannot Self-Correct Reasoning Yet** | ★★ **核心校正**：没有外部反馈时 LLM 难以自我纠错，**有时反而变差** | ICLR 2024 ・ arXiv 2310.01798 |
| **Reflexion: Language Agents with Verbal Reinforcement Learning** | ★ 用语言反馈而非更新权重来强化；情景记忆；HumanEval 91% vs GPT-4 80%；**但依赖反馈信号** | arXiv 2303.11366 |
| **Toolformer: Language Models Can Teach Themselves to Use Tools** | ★ 工具调用要学四件事：which / when / args / **how to use the result** | arXiv 2302.04761 |

**背景（本文仅提及，未直接引用内容）**：

| 论文名 | 用途 | 找 |
|---|---|---|
| **ToolLLM: Facilitating Large Language Models to Master 16000+ Real-world APIs** | 工具规模过大时，"选工具"本身变成检索问题 | ICLR 2024 ・ arXiv 2307.16789 |

**前几篇用过、本文复用的**：

| 论文名 | 用途 | 找 |
|---|---|---|
| **Self-RAG: Learning to Retrieve, Generate, and Critique through Self-Reflection** | "要不要调工具"的自适应决策（[08](08_搭桥实验.md) 架构 B） | ICLR 2024 ・ arXiv 2310.11511 |
| **Chain-of-Verification Reduces Hallucination in Large Language Models** | 完成前自检（第 5.3 节档次 3） | arXiv 2309.11495 |
| **Not what you've signed up for: …Indirect Prompt Injection** | ★ 工具结果 = 不可信输入（文末"和别处的关系"） | arXiv 2302.12173 |

> ⚠️ **一处诚实说明**：ToolLLM 我**只核实了标题与会议（ICLR 2024）**，没有逐字核实正文，
> 所以正文里只把它用作"规模问题存在"的背景提示，**没有引用它的结论**。

---

## 9. 和别处的关系

```Plain
[08_搭桥实验.md] 5.2 架构 B 的 150 行 loop
    ↑ ★ 本文是它的正式版：同一件事，但把每个边界条件都讲透
[08_搭桥实验.md] 6.1 的 path 字段
    ↑ ★ 本文 5.2 的 done / unconfirmed / hit_max_turns 是它的升级版
[05_生成prompt与幻觉抑制.md] 2.1 模型不擅长拒答
    ↑ ★ 本文 6.2 第 ⑤ 条：必须显式授权"允许失败"
[05_生成prompt与幻觉抑制.md] 5. CoVe 的"独立验证"
    ↑ 本文 5.3 档次 3 是它的轻量版（Phase 1 不做）
[RAG学习.md] 12 向量检索如何变成 Agent 的工具
    ↑ ★ 本文第 2 节是它的工具设计展开
[07_工程化与安全.md] 6.4 权限层
    ↑ ★ 本文的 safe_execute 是它的最小形态；
      但请注意：★ 参数校验在服务端做，不靠 prompt
[00_agent开发学习路线.md] Phase 1
    ↑ 本文对应的路线节点
[00_agent开发学习路线.md] Phase 2
    ↑ ★ 本文第 1.2 节第 7 条（上下文一直增长）就是 Phase 2 的入口
```

> ★ 一句话总结：
>
> **Agent Loop 只有 5 行，它的全部难度在"出错了怎么办"。**
>
> 而"自我纠错"不是模型变聪明了，是**工具的客观反馈逼它面对现实**——
> 这也是为什么"把错误回填给模型"是这 5 行里最不能省的一行。
>
> **下一阶段（Phase 2）要解决的，就是你在第 7 节验收时一定会遇到的那个问题：
> 跑到十几轮之后，上下文满了，它开始"忘事"和"跑偏"。**
