# SXNG DeepSearch SOP

> 标准操作流程 for 多轮深度调研（Session + Knowledge Graph + Quality Assessment + Recovery）

## 一、核心理念

**搜索 ≠ 答案**。单次搜索返回的是原始信息，不是验证过的事实。本 SOP 通过**多轮迭代 + 知识图谱 + 质量评估 + 恢复策略**确保输出质量。

**工作流程**：

```
意图分析 → 查询规划 → 多源搜索 → 内容提取 → 图谱构建 → 质量评估 → 恢复/建议 → (循环或输出)
```

---

## 二、触发条件

### 何时使用 Deep Search（`--search-session`）

| 场景 | 示例 |
|------|------|
| 多维度信息整合 | "2026 年主流向量数据库对比" |
| 信息分散需交叉验证 | "PostgreSQL vs MySQL 性能基准" |
| 技术选型/调研报告 | "Rust async 生态系统分析" |
| 追踪话题演变 | "AI 推理模型发展历程" |
| 初始搜索信息不足 | 返回结果 < 5 条相关 |

### 何时使用简单搜索（无 `--search-session`）

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
sxng "FastAPI latest version" --search-limit 5

# Step 2（可选）：提取官方页面验证
sxng extract --urls "https://pypi.org/project/fastapi/"
```

**停止条件**：
- [x] 找到 >= 1 个权威来源（官方文档/PyPI/GitHub）
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
sxng --search-session new --owner "agent-1" --desc "Vector DB comparison" \
     "vector database 2026 Pinecone Weaviate Qdrant comparison"

# Step 2: 预处理 + 提取
sxng graph-preprocess <session> --format json
sxng extract --session <session>

# Step 3: 构建知识图谱
sxng graph-add <session> --data '{
  "entities": [
    {"label": "Pinecone", "entityType": "product", "score": 0.9},
    {"label": "Weaviate", "entityType": "product", "score": 0.85},
    {"label": "Qdrant", "entityType": "product", "score": 0.8}
  ],
  "edges": [
    {"source": "e:Pinecone", "target": "e:Weaviate", "relation": "competitor", "weight": 0.9}
  ]
}'

# Step 4: 质量评估
sxng --search-session <session> --quality

# Step 5: 如质量未达标，获取建议 + 补充搜索
sxng suggest-queries <session> --format json
sxng --search-session <session> --queries \
     "Pinecone pricing 2026,Weaviate vs Qdrant benchmark" --redundancy warn

# Step 6: 探索图谱验证覆盖度
sxng graph-explore <session> --seed "Pinecone" --format json
```

**停止条件**：
- [x] 质量评估 verdict 为 good 或 acceptable
- [x] 每个候选对象 >= 2 个独立来源
- [x] 图谱关键实体已连接

---

### L3：深度调研（4+ 轮搜索）

**特征**：
- 研究级报告
- 需系统性地覆盖子话题
- 信息可能冲突需裁决

**标准操作流程（8 Phase SOP）**：

#### Phase 1: 意图分析与初始搜索

**产出**：
- 核心问题一句话
- 拆解为 3-7 个子查询

```bash
# 创建 Session 并首轮搜索
sxng --search-session new --owner "researcher" --desc "RAG Vector DB deep research" \
     --queries "vector database 2026 ranking,vector DB for RAG comparison"
```

#### Phase 2: 预处理与实体发现

```bash
# 获取 TF-IDF 词项、共现对、已有实体
sxng graph-preprocess <session> --format json

# 提取关键页面内容
sxng extract --session <session>
```

**Agent 判断逻辑**：
- 选择 tfidf > 阈值 且未在已有实体列表中的词项
- 优先选择与其他词项共现次数高的词（连接度高）
- 避免选择过于宽泛的词

#### Phase 3: 构建知识图谱

```bash
sxng graph-add <session> --data '{
  "entities": [...],
  "edges": [...]
}'
```

#### Phase 4: 质量评估

```bash
sxng --search-session <session> --quality
```

5 个独立指标：

| 指标 | 阈值 | 含义 |
|------|------|------|
| resultCount | >= 5 | 结果数量 |
| contentDepth | >= 150 chars | 已提取内容平均长度 |
| entityRichness | >= 2 | Agent 添加的实体数 |
| sourceDiversity | >= 3 | 不同域名数 |
| novelty | >= 0.3 | 新颖结果比例 |

| verdict | 动作 |
|---------|------|
| good | 进入 Phase 8（图谱探索）或综合输出 |
| acceptable | 进入 Phase 5（查询建议），针对性补充 |
| poor | 进入 Phase 7（恢复分析） |

#### Phase 5: 查询建议

```bash
sxng suggest-queries <session> --format json
```

**Agent 判断逻辑**：
- `topEntities` 中有高 degree × frequency 但未充分探索的实体 → 以其为关键词搜索
- `unexploredDomains` 非空 → 选择新域名相关的查询词
- `qualityLastRound.failedIndicators` 包含 "sourceDiversity" → 添加 `-e` 参数使用不同引擎

#### Phase 6: 继续搜索（带冗余检查）

```bash
sxng "follow-up query" --search-session <session> --redundancy warn
```

→ 回到 Phase 2，循环直到质量满意

#### Phase 7: 恢复分析（连续质量不佳时）

```bash
sxng recovery-analysis <session> --format json
```

| 策略 | 适用场景 | Agent 动作 |
|------|----------|-----------|
| reformulate | 查询过于具体，结果太少 | 移除限定词，使用更宽泛表达 |
| engine_rotation | 当前引擎未返回结果 | 更换引擎组合（如从 google 换到 arxiv+github） |
| category_shift | 当前分类结果质量差 | 切换到不同分类（如从 general 到 it） |
| backtrack | 连续 >=2 轮 poor | 回到最近 good 质量的轮次，沿不同方向继续 |

也可查看搜索阶段建议：

```bash
sxng strategy-info <session> --format json
```

- `broad_exploration`：前 2-3 轮，使用通用引擎
- `targeted_deep_dive`：实体增长放缓后，切换到专业引擎（arxiv, github, semantic_scholar）

#### Phase 8: 图谱探索（质量达标后导航知识空间）

```bash
# 发现实体
sxng graph-search <session> --keyword <term> --format json

# 查看实体关系
sxng graph-explore <session> --seed <entity> --format json

# 深入特定关系
sxng graph-drill <session> --seed <entity> --relations <list> --format json

# 遍历推理路径
sxng graph-traverse <session> --path <path-id> --format json
```

**Agent 判断逻辑**：
1. 检查 `suggestedNextSteps` 中的推荐命令
2. 评估各关系的 weight 和 target 的 score
3. 选择 weight 最高且未访问过的关系方向
4. 使用 `graph-drill` 获取具体三元组
5. 如遇到 dead end，使用 alternativePaths 建议

#### 查看完整会话报告

```bash
sxng session-report <session> --format json
```

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
| `broad_exploration` | 探索型（"有哪些选项"）— 前 2-3 轮 |
| `targeted_deep_dive` | 分析型（候选已定，需细节）— 实体增长放缓后 |

使用 `strategy-info` 命令判断当前阶段：

```bash
sxng strategy-info <session> --format json
```

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
- 每个事实性结论 >= 2 个独立来源
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

### 5.4 引用格式

- 每条来源使用 markdown 链接：`[标题](URL)`
- 禁止：编造 URL、只给标题不给链接、使用"多个来源显示"等无证据措辞

---

## 六、工具速查表

### 场景 → 工具映射

| 场景 | 命令 | 备注 |
|------|------|------|
| 单一事实查询 | `sxng "query"` | 不需要 `--search-session` |
| 创建深度研究 | `sxng --search-session new --owner "x" --desc "y" "query"` | 返回 session 路径 |
| 多查询并行 | `sxng --search-session x --queries "q1,q2,q3"` | RRF 融合去重 |
| 提取内容 | `sxng extract --session x` | 批量提取 URL |
| 预处理分析 | `sxng graph-preprocess x` | TF-IDF + 共现 + 实体上下文 |
| 添加图谱实体 | `sxng graph-add x --data '...'` | JSON 格式 |
| 质量评估 | `sxng --search-session x --quality` | 5 指标独立判定 |
| 查询建议 | `sxng suggest-queries x` | topEntities + unexploredDomains |
| 搜索阶段 | `sxng strategy-info x` | broad vs targeted |
| 恢复分析 | `sxng recovery-analysis x` | 4 种恢复策略 |
| 会话报告 | `sxng session-report x` | 质量 + 策略 + 建议 |
| 发现实体 | `sxng graph-search x --keyword "k" [--limit N]` | 按 score×degree 排名 |
| 探索关系 | `sxng graph-explore x --seed "e"` | 出入边 + 下一步建议 |
| 深入关系 | `sxng graph-drill x --seed "e" --relations "r1,r2"` | 三元组 + 下一步 |
| 推理路径 | `sxng graph-traverse x --path "p:chain_001"` | 按跳数遍历 |
| 混淆实体 | `sxng graph-obfuscate x --list` | 实验性 |
| 冗余检查 | `--redundancy warn` | warn/adjust/skip |
| 列出 Sessions | `sxng session-list` | 查看统计 |
| 清理旧数据 | `sxng session-delete --older 24` | 删除 24h 前 |

### 常用参数

| 参数 | 用途 |
|------|------|
| `-e google,github` | 指定搜索引擎 |
| `-c it,science` | 指定分类 |
| `--time week` | 时间过滤 |
| `--output-format json` | JSON 输出（主程序） |
| `-f json` | JSON 输出（子命令） |
| `-l 20` / `--search-limit 20` | 结果数量 |
| `--lang zh` | 语言过滤 |

---

## 七、自检清单

在输出最终答案前检查：

- [ ] 每个事实性结论都有 `[标题](URL)` 引用
- [ ] 单一来源结论标注了 **置信度: Low**
- [ ] 来源分歧处展示了双方证据
- [ ] 使用了 `sxng extract` 提取关键页面内容
- [ ] L2/L3 级别使用了 `--search-session` 和知识图谱
- [ ] L3 级别使用了 `--quality` 评估并据此决定下一步
- [ ] 没有使用"一般认为/据报道"等无来源措辞
- [ ] 图谱覆盖度已通过 `graph-explore` 验证

---

## 八、完整示例

### L3 示例："2026 年向量数据库深度对比"

```bash
# === Phase 1: 创建 Session ===
sxng --search-session new --owner "researcher" --desc "Vector DB deep research 2026" \
     --queries "vector database 2026 ranking,vector DB for RAG comparison"
# 输出: Session created at ~/sxng-cli/sessions/ds_1234567890_abcdef

SESSION="ds_1234567890_abcdef"

# === Phase 2: 预处理 + 提取 ===
sxng graph-preprocess $SESSION --format json
sxng extract --session $SESSION

# === Phase 3: 构建知识图谱 ===
sxng graph-add $SESSION --data '{
  "entities": [
    {"label": "Pinecone", "entityType": "managed_service", "score": 0.95},
    {"label": "Weaviate", "entityType": "opensource", "score": 0.9},
    {"label": "Qdrant", "entityType": "opensource", "score": 0.85},
    {"label": "HNSW", "entityType": "algorithm", "score": 0.9}
  ],
  "edges": [
    {"source": "e:Pinecone", "target": "e:HNSW", "relation": "uses", "weight": 0.9},
    {"source": "e:Weaviate", "target": "e:HNSW", "relation": "uses", "weight": 0.95}
  ]
}'

# === Phase 4: 质量评估 ===
sxng --search-session $SESSION --quality

# === Phase 5: 查询建议（如质量未达 good）===
sxng suggest-queries $SESSION --format json

# === Phase 6: 第二轮搜索（带冗余检查）===
sxng --search-session $SESSION --queries \
     "Qdrant rust implementation,HNSW vs IVF performance" --redundancy warn

# === 再次提取 + 构建图谱 + 评估 ===
sxng extract --session $SESSION
sxng graph-add $SESSION --data '{"entities":[...],"edges":[...]}'
sxng --search-session $SESSION --quality

# === Phase 7: 恢复分析（如连续 poor）===
sxng recovery-analysis $SESSION --format json
sxng strategy-info $SESSION --format json

# === Phase 8: 图谱探索（质量达标后）===
sxng graph-search $SESSION --keyword "vector"
sxng graph-explore $SESSION --seed "Pinecone" --format json
sxng graph-drill $SESSION --seed "Pinecone" --relations "uses,competitor" --format json

# === 清理 ===
sxng session-delete $SESSION  # 完成后删除
```

## 九、反模式（Don'ts）

| 反模式 | 正确做法 |
|--------|----------|
| 单次搜索就给出结论 | L2/L3 使用 `--search-session` 多轮迭代 |
| 只用一个来源 | 每个事实 >= 2 独立来源交叉验证 |
| 忽略来源质量 | 区分白名单/灰区/黑名单来源 |
| 隐藏信息分歧 | 展示分歧并说明判断依据 |
| 编造引用链接 | 只使用真实访问过的 URL |
| 不提取内容只读摘要 | 对关键来源使用 `extract` |
| 知识图谱建完不查询 | 使用 `graph-explore` 验证覆盖度 |
| 不评估质量就继续搜索 | 每轮用 `--quality` 评估，据此决策 |
| 重复查询浪费轮次 | 使用 `--redundancy warn` 检查冗余 |
| 连续 poor 不恢复 | 使用 `recovery-analysis` 获取策略建议 |
| Session 用完不清理 | 定期 `session-delete --older` |
| 使用 `query-graph` | 已废弃，使用 `graph-explore` + `graph-drill` |
