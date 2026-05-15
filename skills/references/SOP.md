# SXNG DeepSearch SOP

> 标准操作流程 for 多轮深度调研（Session + Knowledge Graph + RRF Fusion）

## 一、核心理念

**搜索 ≠ 答案**。单次搜索返回的是原始信息，不是验证过的事实。本 SOP 通过**多轮迭代 + 知识图谱 + 来源交叉验证**确保输出质量。

**工作流程**：

```
意图分析 → 查询规划 → 多源搜索 → 内容提取 → 图谱构建 → 差距分析 → (循环或输出)
```

---

## 二、触发条件

### 何时使用 Deep Search（`--session`）

| 场景 | 示例 |
|------|------|
| 多维度信息整合 | "2026 年主流向量数据库对比" |
| 信息分散需交叉验证 | "PostgreSQL vs MySQL 性能基准" |
| 技术选型/调研报告 | "Rust async 生态系统分析" |
| 追踪话题演变 | "AI 推理模型发展历程" |
| 初始搜索信息不足 | 返回结果 < 5 条相关 |

### 何时使用简单搜索（无 `--session`）

| 场景 | 示例 |
|------|------|
| 具体事实查询 | "Python dict get 方法用法" |
| 定位官方文档 | "FastAPI 官方文档地址" |
| 错误解决方案 | "Docker port already allocated 解决" |
| 最新版本号 | "React 最新版本" |

---

## 三、复杂度分级（L1/L2/L3）

根据问题复杂度选择工具序列：

### L1：单一事实（1-2 轮搜索）

**特征**：
- 答案唯一、无争议
- 1-2 个关键词即可覆盖
- 无需深度比较

**工具序列**：

```bash
# Step 1: 单次搜索
sxng "FastAPI latest version" --limit 5

# Step 2（可选）：提取官方页面验证
sxng extract --urls "https://pypi.org/project/fastapi/"
```

**停止条件**：
- [x] 找到 ≥ 1 个权威来源（官方文档/PyPI/GitHub）
- [x] 信息无矛盾

---

### L2：多角度比较（2-4 轮搜索）

**特征**：
- 2-5 个候选对象对比
- 需要多个维度（性能/功能/定价）
- 信息需交叉验证

**工具序列**：

```bash
# Step 1: 创建 Session
sxng --session new --owner "agent-1" --desc "Vector DB comparison" \
     "vector database 2026 Pinecone Weaviate Qdrant comparison"

# Step 2: 提取关键页面内容
sxng extract --session <session-name>

# Step 3: 补充搜索具体维度
sxng --session <session-name> --queries \
     "Pinecone pricing 2026,Weaviate vs Qdrant benchmark"

# Step 4: 构建知识图谱（关键实体）
sxng graph-add <session-name> --data '{
  "entities": [
    {"label": "Pinecone", "entityType": "product", "score": 0.9},
    {"label": "Weaviate", "entityType": "product", "score": 0.85},
    {"label": "Qdrant", "entityType": "product", "score": 0.8}
  ],
  "edges": [
    {"source": "e:Pinecone", "target": "e:Weaviate", "relation": "competitor", "weight": 0.9}
  ]
}'

# Step 5: 验证覆盖度
sxng query-graph <session-name> --seeds "Pinecone" --depth 2
```

**停止条件**：
- [x] 每个候选对象 ≥ 2 个独立来源
- [x] 覆盖所有对比维度
- [x] 图谱显示关键实体已连接

---

### L3：深度调研（4+ 轮搜索）

**特征**：
- 研究级报告
- 需系统性地覆盖子话题
- 信息可能冲突需裁决

**标准操作流程（SOP）**：

#### Phase 1: 意图分析与规划（手动或 LLM 辅助）

**产出**：
- 核心问题一句话
- 拆解为 3-7 个子查询
- 标注依赖关系

```
核心问题："2026 年最适合 RAG 的向量数据库是什么？"

子查询：
1. "2026 年主流向量数据库排行"（depends_on: []）
2. "Pinecone RAG 性能基准 2026"（depends_on: [1]）
3. "Weaviate vs Qdrant RAG 对比"（depends_on: [1]）
4. "向量数据库定价模型对比"（depends_on: []）
5. "开源向量数据库社区活跃度"（depends_on: [1]）
```

#### Phase 2: 执行搜索

```bash
# Round 1: 广度扫描（并行执行）
sxng --session new --owner "researcher" --desc "RAG Vector DB deep research" \
     --queries "vector database 2026 ranking,vector DB for RAG comparison"

# Round 2: 深度挖掘（基于 Round 1 结果）
sxng --session <session-name> --queries \
     "Pinecone RAG benchmark 2026,Weaviate HNSW performance,Qdrant rust implementation"

# Round 3: 补充验证
sxng --session <session-name> --queries \
     "Pinecone pricing vs Weaviate,open source vector DB github stars"
```

#### Phase 3: 内容提取

```bash
# 自动提取 Session 中所有结果
sxng extract --session <session-name>

# 或针对特定高价值 URL 单独提取
sxng extract --urls "https://docs.pinecone.io/...,https://weaviate.io/..."
```

#### Phase 4: 知识图谱构建

```bash
# 添加关键实体和关系
sxng graph-add <session-name> --data '{
  "entities": [
    {"label": "Pinecone", "entityType": "managed_service", "score": 0.95},
    {"label": "Weaviate", "entityType": "opensource", "score": 0.9},
    {"label": "Qdrant", "entityType": "opensource", "score": 0.85},
    {"label": "HNSW", "entityType": "algorithm", "score": 0.8}
  ],
  "edges": [
    {"source": "e:Pinecone", "target": "e:HNSW", "relation": "uses", "weight": 0.9},
    {"source": "e:Weaviate", "target": "e:HNSW", "relation": "uses", "weight": 0.95}
  ]
}'
```

#### Phase 5: 差距分析与迭代

```bash
# 查询图谱覆盖度
sxng query-graph <session-name> --seeds "Pinecone,Weaviate,Qdrant" --depth 2

# 检查是否有孤立实体或缺失关系
# 如有 gaps → 回到 Phase 2 补充搜索
```

#### Phase 6: 综合输出

基于 Session 中的 `results.json` 和 `graph.json` 生成研究报告。

**停止条件**：
- [x] ≥ 3 轮搜索
- [x] 每轮新发现 < 3 条时停止
- [x] 知识图谱覆盖所有关键实体
- [x] 每个核心声明 ≥ 2 个独立来源

---

## 四、搜索规划框架

### 4.1 意图分析

从用户问题中提取：

| 字段 | 说明 | 示例 |
|------|------|------|
| `core_question` | 一句话重述 | "2026 Q2 最适合 RAG 的向量数据库？" |
| `query_type` | factual/comparative/exploratory | "comparative" |
| `time_sensitivity` | realtime/recent/historical | "recent" |
| `terms_to_verify` | 需先验证的术语 | ["RAG workload", "HNSW"] |

### 4.2 查询拆解原则

- **非重叠**：子查询之间不重复
- **依赖标注**：B 依赖 A 的结果时标注 `depends_on: [A]`
- **数量上限**：3-7 个子查询，超过需拆分课题

### 4.3 策略选择

| 策略 | 适用场景 |
|------|----------|
| `broad_first` | 探索型（"有哪些选项"） |
| `narrow_first` | 分析型（候选已定，需细节） |
| `targeted` | 事实型（目标信息位置已知） |

---

## 五、证据标准

### 5.1 来源质量

**白名单（倾向信任）**：
- 官方文档（docs.*, README, 官方站点）
- 包管理器（PyPI, npm, crates.io）
- 标准文档（PEP, RFC, W3C）
- 学术来源（arxiv.org, ACM, IEEE）

**灰区（谨慎使用）**：
- 技术博客（看作者权威性）
- Stack Overflow（看投票和采纳）
- GitHub Issues（取趋势信号，不当定论）

**黑名单（避免）**：
- SEO 农场（关键词堆砌、机器生成）
- AI 机翻聚合站
- 无发布时间的内容

### 5.2 交叉验证

**硬性要求**：
- 每个事实性结论 ≥ 2 个独立来源
- "独立" = 不同域名 + 不同作者 + 非相互转载

**单一权威来源不需要 Low 标注**：
```
FastAPI 0.136.0 发布于 2026-04-16。
Sources:
- [fastapi - PyPI](https://pypi.org/project/fastapi/)
```
**单一非权威来源需标注**：
```
某公司计划开源其内部框架（置信度: Low，单一非官方来源）
— 仅一家科技媒体报道，公司官方未确认。

Sources:
- [某科技媒体报道](https://example.com/article)
```

### 5.3 冲突处理

当来源说法不一致时：

1. **不隐藏分歧** — 展示双方证据
2. **评估权威性** — 官方 > 主流媒体 > 自媒体
3. **评估时效性** — 近期 > 远期
4. **给出判断** — 说明依据或诚实标注不确定

**示例**：

```
Python 3.14 的 free-threaded 状态存在分歧：

- PEP 779（2025-09）：计划在 3.14 "experimental-but-supported"
- Python Wiki：描述 3.14 已 "default enabled"

判断：PEP 779 更权威。**置信度: Medium**，建议直接查阅 python.org 确认。
```

### 5.4 引用格式

- 每条来源使用 markdown 链接：`[标题](URL)`
- 禁止：编造 URL、只给标题不给链接、使用"多个来源显示"等无证据措辞

---

## 六、工具速查表

### 场景 → 工具映射

| 场景 | 命令 | 备注 |
|------|------|------|
| 单一事实查询 | `sxng "query"` | 不需要 `--session` |
| 创建深度研究 | `sxng --session new --owner "x" --desc "y" "query"` | 返回 session 路径 |
| 多查询并行 | `sxng --session x --queries "q1,q2,q3"` | RRF 融合去重 |
| 提取内容 | `sxng extract --session x` | 批量提取 URL |
| 添加图谱实体 | `sxng graph-add x --data '...'` | JSON 格式 |
| 查询图谱 | `sxng query-graph x --seeds "e" --depth 2` | BFS 子图 |
| 列出 Sessions | `sxng session-list` | 查看统计 |
| 清理旧数据 | `sxng session-delete --older 24` | 删除 24h 前 |

### 常用参数

| 参数 | 用途 |
|------|------|
| `-e google,github` | 指定搜索引擎 |
| `-c it,science` | 指定分类 |
| `--time week` | 时间过滤 |
| `-f json` | JSON 输出（用于下游处理） |
| `-l 20` | 结果数量 |
| `--lang zh` | 语言过滤 |

---

## 七、自检清单

在输出最终答案前检查：

- [ ] 每个事实性结论都有 `[标题](URL)` 引用
- [ ] 单一来源结论标注了 **置信度: Low**
- [ ] 来源分歧处展示了双方证据
- [ ] 使用了 `sxng extract` 提取关键页面内容
- [ ] L2/L3 级别使用了 `--session` 和知识图谱
- [ ] 没有使用"一般认为/据报道"等无来源措辞

---

## 八、完整示例

### L3 示例："2026 年向量数据库深度对比"

```bash
# === Phase 1: 创建 Session ===
sxng --session new --owner "researcher" --desc "Vector DB deep research 2026" \
     "vector database 2026 ranking Pinecone Weaviate Qdrant"
# 输出: Session created at ~/sxng-cli/sessions/ds_1234567890_abcdef

SESSION="ds_1234567890_abcdef"

# === Phase 2: 首轮搜索（广度）===
sxng --session $SESSION --queries \
     "vector database benchmark 2026,Pinecone vs Weaviate performance"

# === Phase 3: 提取内容 ===
sxng extract --session $SESSION

# === Phase 4: 第二轮搜索（深度）===
sxng --session $SESSION --queries \
     "Qdrant rust implementation,HNSW vs IVF performance"

# === Phase 5: 提取新内容 ===
sxng extract --session $SESSION

# === Phase 6: 构建知识图谱 ===
sxng graph-add $SESSION --data '{
  "entities": [
    {"label": "Pinecone", "entityType": "managed_service", "score": 0.9},
    {"label": "Weaviate", "entityType": "opensource", "score": 0.85},
    {"label": "Qdrant", "entityType": "opensource", "score": 0.8},
    {"label": "HNSW", "entityType": "algorithm", "score": 0.9}
  ],
  "edges": [
    {"source": "e:Pinecone", "target": "e:HNSW", "relation": "uses", "weight": 0.9},
    {"source": "e:Weaviate", "target": "e:HNSW", "relation": "uses", "weight": 0.95}
  ]
}'

# === Phase 7: 验证覆盖度 ===
sxng query-graph $SESSION --seeds "Pinecone,Weaviate,Qdrant" --depth 2

# === Phase 8: 第三轮搜索（补充）===
# 如发现 gaps，继续搜索...
sxng --session $SESSION --queries \
     "vector database pricing comparison 2026,open source vector DB community"

# === Phase 9: 清理 ===
# sxng session-delete $SESSION  # 完成后删除
```

---

## 九、反模式（Don'ts）

| ❌ 反模式 | ✅ 正确做法 |
|-----------|-------------|
| 单次搜索就给出结论 | L2/L3 使用 `--session` 多轮迭代 |
| 只用一个来源 | 每个事实 ≥ 2 独立来源交叉验证 |
| 忽略来源质量 | 区分白名单/灰区/黑名单来源 |
| 隐藏信息分歧 | 展示分歧并说明判断依据 |
| 编造引用链接 | 只使用真实访问过的 URL |
| 不提取内容只读摘要 | 对关键来源使用 `extract` |
| 知识图谱建完不查询 | 使用 `query-graph` 验证覆盖度 |
| Session 用完不清理 | 定期 `session-delete --older` |

---

## 十、参考

- [SearXNG 文档](https://docs.searxng.org/)
- [RRF Fusion 论文](https://plg.uwaterloo.ca/~gvcormac/cormacksigir09-rrf.pdf)
- [GraphRAG: Microsoft Research](https://github.com/microsoft/graphrag)
