# iFinD、扶摇与MCP接入说明

## 当前真实状态

**已完成：iFinD官方HTTP行情适配器和页面入口。未完成：带有效账号的真实行情联调。** 当前用户没有提供数据账号或凭证，测试使用明确标注的合成响应；不能声称已经取到iFinD真实行情。

实现内容：服务端换取access_token、批量查询五家A股样本最新价、鉴权失效处理、超时/限流/格式错误处理、15秒成功缓存、提供方时间与查询时间分别展示。行情数据不会修改产业链归属、证据分级或公司财务。

只确认了官方示例中的 `latest` 最新价字段。成交额、换手率等实时指标、海外市场代码和账户权限没有完成真实验证，因此本轮不生成热门榜排名。无源站时间时不把价格标成实时价。

## 官方依据

- [同花顺数据接口官网](https://quantapi.51ifind.com/)：有登录、申请试用和帮助中心入口。
- [官方HTTP接口示例](https://quantapi.51ifind.com/gwstatic/static/ds_web/quantapi-web/example.html)：定位“HTTP接口应用案例（python环境）”。
- `POST https://quantapi.51ifind.com/api/v1/get_access_token`：请求头 `refresh_token`，结果 `data.access_token`。
- `POST https://quantapi.51ifind.com/api/v1/real_time_quotation`：请求头 `access_token`，JSON内容 `{"codes":"002050.SZ,601689.SH","indicators":"latest"}`。
- [官方使用流程](https://quantapi.51ifind.com/gwstatic/static/ds_web/quantapi-web/help-center/deploy.html)：可通过客户端“超级命令 → 工具 → refresh_token查询”，也可通过[网页版超级命令 → 账号详情](https://quantapi.10jqka.com.cn/gwstatic/static/ds_web/super-command-web/index.html#/AccountDetails)获取refresh_token；Mac可优先使用网页方式。
- [官方权限说明](https://quantapi.51ifind.com/gwstatic/static/ds_web/quantapi-web/help-center/permission.html)：免费版可用iFinD账号登录，无需先申请试用。先核对账号实际字段/HTTP权限，不能据此承诺任何账号都能取到全部所需数据。

文档核对日期：2026-09-30。本项目没有绕过授权或猜测私有MCP端点。

## 用户需要取得的资源

1. 向出题方询问是否提供扶摇、iFinD测试账号或数据接口权限。
2. 若不提供，先在iFinD官方入口登录账号，核对免费版可用权限；官方说明免费版无需先申请试用。没有账号时按官方账号页面办理，若没有自助注册入口，可使用“申请试用”或联系官网客服952555，说明需要HTTP接口与A股最新行情。是否具备具体字段权限需实际核对。
3. 确认授权是否允许本次展示用途，再把凭证配置在服务器私密环境中。不要发到聊天、GitHub源码、截图或网页输入框。

可给出题方的询问文本：

> 我在实现人形机器人产业研究产品。请问是否提供扶摇和iFinD MCP的测试账号？需要服务地址、鉴权方式、可调用工具/指标说明、权限范围与数据展示使用条件。如果没有MCP，也可使用有权限的iFinD HTTP数据接口。

## 在网页获取凭证

1. 登录iFinD数据接口官网。
2. 打开上述网页版超级命令，在“账号详情”查询refresh_token。官网同时支持Windows客户端查询，但不必为了取凭证先安装Windows。
3. 若账号不能登录、没有凭证入口或字段无权限，联系官网客服，说明需要数据接口HTTP权限及Web演示使用范围；不要反复刷新令牌。官方说明更新refresh_token会使此前各环境的refresh_token与access_token失效。
4. 只在本地私密 `.env` 或云端环境变量中保存凭证，不在聊天、截图或仓库中提供。

## 本地配置

打开项目本地 `.env`，保留原有AI网关配置，新增：

```dotenv
IFIND_REFRESH_TOKEN=在本机私密配置中填写
IFIND_DISPLAY_AUTHORIZED=false
```

确认账号许可涵盖本次Web展示后，才将 `IFIND_DISPLAY_AUTHORIZED` 改为 `true`。该配置用于记录使用范围确认，不替代提供方授权；未确认时行情接口返回403，且不向提供方取数。

也可仅配置有效的 `IFIND_ACCESS_TOKEN`，但失效后需要手动更新。建议使用refresh_token；服务端只在固定的官方域名发送凭证，不接受网页传入的任意数据API地址。

重新启动完整Node服务：

```bash
npm start
```

使用HTTP地址打开，不能直接打开 `file:///.../index.html` 运行接口。进入“行业与公司发现 → 市场热门 → 检查接入状态 → 获取A股样本最新价”。

## 腾讯云配置

在已建立的 `robot-evidence-research` 项目服务端环境变量中填写 `IFIND_REFRESH_TOKEN`，并在确认展示权限后设置 `IFIND_DISPLAY_AUTHORIZED=true`，重新部署。密钥不进入public目录、data.js、GitHub或导出研究记录。本轮尚无数据凭证，因此未在腾讯云写入占位密钥，也未显示为已连接。

## 接口与诊断

- `GET /api/providers`：只返回接入状态，不返回凭证。区分待配置、已配置未验证、此前成功验证。
- `POST /api/quotes`：只接受已有A股公司的 `companyIds`，最多5个，不允许任意代码或任意数据源代理。
- 无凭证：返回 `IFIND_NOT_CONFIGURED`，不向提供方发请求。
- 401/403：鉴权或权限失败；有refresh_token时只重试换取一次，避免循环。
- 429、网络超时、5xx、坏JSON、代码错配、多期/冲突快照：明确报错；不以0或假数据替代。
- 成功结果缓存15秒。网络失败时可保留此前快照，但明确标为旧记录，不当作实时；凭证/权限失效时清除页面快照并暂停查询。

## 为什么这还不是iFinD MCP或扶摇

iFinD HTTP行情服务与iFinD MCP是不同接入方式。没有MCP地址、鉴权和工具说明，不能假设私有工具名或参数。扶摇也只有题目里的名称，尚未取得可验证的具体服务身份与接口协议。本轮不会用同名无关服务或其他行情源冒充它们。

适配层能在拿到凭证后直接联调，但账号授权与真实接口验收仍是必需的最后一步。没有凭证时，公告证据、AI提取和研究版本流程仍可使用。
