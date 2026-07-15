# Yosuke 的足迹地图

一个私密的中国旅行地图、故事档案与朋友互动空间。项目使用 Next.js、Supabase 和 Vercel，当前内置交互演示模式，在未配置 Supabase 时也可完整预览页面。

## 本地运行

```powershell
pnpm install
pnpm dev
```

打开 `http://localhost:3000`，点击“直接进入交互演示”。演示管理员登录也可使用 `admin@yosuke.demo`。

## 接入 Supabase

1. 创建 Supabase 项目。
2. 在 SQL Editor 执行 `supabase/schema.sql`。
3. 复制 `.env.example` 为 `.env.local`，填写 Supabase URL 和 anon key。
4. 在 Supabase Auth 中启用邮箱密码登录与邮箱验证，并配置用于验证、重置密码的 SMTP。
5. 注册你的账号后，按 `schema.sql` 最后一行注释中的 SQL 将该账号设为管理员。
6. 创建 Cloudflare Turnstile 站点，并填写 site key 与 secret key。

## 部署到 Vercel

将项目推送到 Git 仓库，在 Vercel 导入项目，并把 `.env.local` 对应的变量添加到项目环境变量中。构建命令使用 `pnpm build`。

## 数据与隐私

- 省份、故事、照片、留言、通知均通过 Supabase RLS 限制为已登录用户访问。
- 媒体 bucket 均为私有，不公开暴露旅行照片。
- 普通用户只能管理自己的资料、留言、点赞和评论图片。
- 管理员可以管理省份、故事、用户和违规内容。
- `public/data/china-provinces.json` 为本地省级 GeoJSON，页面不依赖第三方地图 API。

## 当前演示数据

页面中的四川、云南故事及旅行统计全部标注为示例内容，不代表 Yosuke 的真实旅行经历。接入 Supabase 后可从管理后台替换。
