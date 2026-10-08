# zhihebot.shop 前端 V2

这是 `zhihebot.shop` 的静态前端版本，默认连接：

```text
https://api.zhihebot.shop
```

## 已包含

- 现代化商城首页 / Hero / 公告栏
- 分类筛选、商品搜索
- 商品卡片
- 商品详情弹窗
- 商品详情 Q&A
- 创建订单前端入口（`POST /public/orders`）
- 订单查询（`GET /public/orders/:id`）
- 卡密充值中心 UI（尝试调用 `POST /public/redeem`）
- FAQ / 购买教程 / 售后说明
- 移动端适配
- 深色 Hero / 玻璃风格面板 / 响应式布局
- API 驱动的商品、站点信息、公告、支付配置

## 当前后端兼容

前端已经兼容你现有的：

```text
GET https://api.zhihebot.shop/public/config
```

页面会从返回结果读取：

```json
{
  "settings": {},
  "payments": {},
  "products": []
}
```

其中 `products` 有数据时，商城自动渲染商品。

## 约定的可选订单接口

为了让前端“立即下单 / 卡密充值”真正工作，后端可提供：

```text
POST /public/orders
GET  /public/orders/:id
POST /public/redeem
```

前端不会伪造成功。如果接口不存在，会直接把后端错误显示出来。

## GitHub 上传

仓库：

```text
https://github.com/deepseek10010/zhihebot-frontend.git
```

把本目录中的以下文件上传到仓库根目录：

```text
index.html
app.js
styles.css
README.md
```

## Cloudflare Pages

推荐部署链路：

```text
GitHub → Cloudflare Pages → zhihebot.shop
```

构建方式：

- Framework preset：None
- Build command：留空
- Build output directory：`/`
- Root directory：`/`

## 重要

当前你的 API 已能返回配置，但 `products` 之前为空。因此，部署前端后，如果 API 仍返回空商品列表，页面会正常显示“当前还没有商品”的提示；这是后端商品数据尚未配置导致的，不是前端白屏。
