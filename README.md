# 墨锭试磨室

运行：

```bash
npm start
```

访问 `http://localhost:3037`。数据保存在 `data/ink-stick-testing.json`。

## 养护与试磨流程

1. **入室建档**：绑定生产批次、养护时长（小时）和温湿度范围，状态为「养护中」，养护计时开始。
2. **温湿度记录**：每次记录先结算养护计时；超出环境范围即暂停并记下原因，回到范围后从暂停点续算。有效养护时长累计到期后自动转「待初评」。
3. **初评**：养护未到期不能初评。初评达到 85 分只进入「待复磨」，未达 85 分转「重点观察」。
4. **复磨**：须在初评满 24 小时后才能复磨定级。复磨比初评低 5 分或出现沉淀 → 「重点观察」；否则按复磨结果定级为「已试磨」。

页面按批次分组展示每锭墨的剩余养护时间、暂停原因和下一步，并保留每次温湿度与试磨记录。

## 代码分层

- `src/rules.js`：判定规则（环境判定、养护计时、初评/复磨流转、下一步提示），纯函数，不碰存储。
- `src/store.js`：数据保存（JSON 读写、首次播种、旧数据缺省补齐）。
- `src/page.js`：页面（批次看板、入室/环境/试磨表单）。
- `server.js`：HTTP 路由与参数校验。

## 接口

- `GET /api/items`：列表（含剩余养护时间、暂停原因、下一步等视图数据）
- `POST /api/items`：入室建档（必填 `code`、`batch`、`curingHours`、`tempMin`/`tempMax`、`humidityMin`/`humidityMax`）
- `POST /api/items/:id/env`：温湿度记录（`temperature`、`humidity`、`note`）
- `POST /api/items/:id/test`：试磨（按状态自动判定初评/复磨；`paper`、`water`、`speed`、`colorLayer`、`sediment`、`score`）
- `POST /api/items/:id/logs`：追加备注
- `GET /api/stats`：各状态数量
