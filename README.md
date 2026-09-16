# Sage

> From confusion to clarity · 搞定每一个知识点

**Sage** 是面向高中生的 AI 辅学产品：拍错题 → 定位知识点 → 推视频 / 练同类题 → 苏格拉底式追问，围绕掌握度闭环学习。

线上地址：[sageteach.top](https://sageteach.top)

## 功能概览

- **拍题识点** — ERNIE-VL 识别错题，提炼薄弱知识点
- **复盘辅导** — DeepSeek 驱动的学科复盘与追问
- **我的考点** — 按学科沉淀考点与掌握度
- **今日训练** — 基于薄弱点生成每日练习队列
- **九大学科** — 语数英物化生政史地

## 技术栈

| 层 | 技术 |
| --- | --- |
| 前端 | React 19 · Vite 7 · TypeScript · TanStack Router / Query · Tailwind CSS 4 · shadcn/ui |
| 后端 | Supabase（Auth · Postgres · RLS · Edge Functions） |
| AI | DeepSeek（对话 / 复盘）· 文心 ERNIE-VL（拍照识题） |
| 部署 | Cloudflare Pages（`wrangler`） |

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

在 `.env` 中填入：

| 变量 | 说明 |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase 项目 URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase 可公开密钥 |
| `VITE_SUPABASE_PROJECT_ID` | 项目 ID |
| `VITE_DEEPSEEK_API_KEY` | DeepSeek API Key（开发用） |
| `VITE_ERNIE_API_KEY` | 文心 ERNIE-VL API Key |

生产环境浏览器通过 `https://db.sageteach.top` 代理访问 Supabase；密钥请勿提交到仓库。

### 3. 本地开发

```bash
npm run dev
```

### 常用脚本

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 本地开发 |
| `npm run build` | 生产构建 → `dist/` |
| `npm run preview` | 预览构建结果 |
| `npm run deploy` | 构建并部署到 Cloudflare Pages |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |

## 项目结构

```
src/
  routes/                 # TanStack 文件路由（落地页、鉴权、/app/*）
  components/             # UI 与业务面板
  lib/                    # AI、知识点追踪、复盘、分析等
  integrations/supabase/  # Supabase 客户端
supabase/
  migrations/             # 数据库迁移
  functions/              # Edge Functions（如 deepseek-chat）
docs/                     # 架构与产品分析文档
public/                   # Cloudflare Pages headers / redirects
```

## 文档

- [知识点中心架构](docs/sage-knowledge-centered-architecture.md)
- [知识追踪架构](docs/knowledge-tracking-architecture.md)
- [产品分析](docs/product-analytics.md)

## 部署

```bash
npm run deploy
```

需已配置 Wrangler / Cloudflare Pages 项目 `sageteach`。构建时请在 Pages 环境同步注入 `VITE_*` 变量。

## License

Private / unpublished — 版权所有 © Sage
