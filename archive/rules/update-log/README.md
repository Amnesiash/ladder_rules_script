# Workflow 自动更新记录

本目录专门记录 GitHub Actions workflow 自动更新产生的内容，按月份归档。记录范围严格限定为 `rules/release/`：新增文件或目录只记录路径；已有文件发生变化时，文本规则文件记录具体新增和删除的规则，其他 release 文件只记录文件变化。记录由 `build_scripts/record-rule-changes.mjs` 自动生成，`rules/source/` 及其他目录的变化不会写入这里。

## 文件命名

每个月使用一个 Markdown 文件，文件名格式为 `YYYY-MM.md`，例如：

- `2026-10.md`
- `2026-11.md`

## 记录格式

每次 workflow 自动更新新增一个日期小节，至少包含以下内容：

- workflow 名称或运行类型
- 更新内容点
- 涉及文件
- 运行结果或备注（如有）

示例：

```markdown
## 2026-10-27

### Workflow

- `Build.yml`（定时运行）

### 更新内容

- ……

### 涉及文件

- `rules/release/……`

### 运行结果

- 成功
```