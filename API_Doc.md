## 0. Preface

> **This API documentation applies to `UFI-TOOLS v3.1.5`version**
> **All `POST` request bodies in this document (except official APIs) are in `JSON` format**
> **All `GET` request parameters in this document are `query` parameters**

## 1. Request Signature Rules

The signature mechanism serves the following purposes:

- Prevents request forgery (e.g., cross-site, replay attacks)
- Server can verify whether `kano-sign` is valid and matches `kano-t`
- Simple "authentication + tamper-proof" approach

### 1. **Adding Request Headers**

Each request automatically appends two custom request headers:

| Header Key  | Description                             |
| ----------- | -------------------------------- |
| `kano-t`    | Current timestamp (milliseconds, `Date.now()`) |
| `kano-sign` | Signature string for request validation   |
| `Authorization` | SHA256 hash of the password (lowercase)   |

------

### 2. **Signature Calculation Logic**

The core signature formula is:

```
kano-sign = SHA256( SHA256(part1) + SHA256(part2) )
```

Steps are as follows:

#### (1) Construct raw data:

```js
rawData = "minikano" + HTTP_METHOD + URL_PATH + timestamp
```

- `HTTP_METHOD`：Request method, e.g., `GET` / `POST` (uppercase)
- `URL_PATH`：Request path (without query parameters), e.g., `/api/data`
- `timestamp`：`Date.now()`，current millisecond timestamp

#### (2) Use HMAC-MD5 for the first encryption step:

```js
hmac = HMAC_MD5(rawData, secretKey)
```

- Fixed secret key:

  ```js
  "minikano_kOyXz0Ciz4V7wR0IeKmJFYFQ20jd"
  ```

#### (3) Split the HMAC value into two halves:

- `part1`：First half of the bytes
- `part2`：Second half of the bytes

#### (4) SHA256 each part:

```js
sha1 = SHA256(part1)
sha2 = SHA256(part2)
```

#### (5) Concatenate and final SHA256:

```js
finalHash = SHA256(sha1 + sha2)
```

------

### 3. **Usage Example**

Assuming the request is:

```js
fetch("/api/user?id=123", { method: "POST" });
```

Internal processing flow:

- Extract method: `POST`

- Extract path: `/api/user`

- Get current timestamp: e.g., `1718438543772`

- Construct signature raw data:

  ```
  minikanoPOST/api/user1718438543772
  ```

- Generate signature using the above algorithm and add request headers:

```http
kano-t: 1718438543772
kano-sign: <calculated SHA256 hash>
```

**JSCode reference:[https://github.com/kanoqwq/UFI-TOOLS/blob/http-server-version/app/frontEnd/public/script/requests.js](https://github.com/kanoqwq/UFI-TOOLS/blob/http-server-version/app/frontEnd/public/script/requests.js)**



## 2. API Examples

> **Note: All POST request bodies mentioned here are in JSON format**、**GET requests use Query or no parameters**

**GET Request Example**

```
GET /api/AT?command=AT+CSQ&slot=0
```

Returns:

```json
{
  "result": "XXXXXX OK"
}
```

**POST Request Example**

``` 
POST http://192.168.1.1/goform/login
Authorization: sha256(password)
Content-Type: application/json
{ "username": "admin", "password": "123456" }
```

Returns:

```json
{
  "result": "success"
}
```

------



### ADB Module

| Method | Path                    | Description                    | Parameters            | Auth Required |
| ---- | ----------------------- | ----------------------- | --------------------- | -------- |
| GET  | `/api/adb_wifi_setting` | Get network ADB auto-start status   | None                    | Yes      |
| POST | `/api/adb_wifi_setting` | Set network ADB auto-start status   | `enabled`, `password` | Yes      |
| GET  | `/api/adb_alive`        | Check if network ADB is running | None                    | Yes      |

------



### Advanced Tools Module（Advanced Tools Module）

| Method | Path                   | Description                              | Parameters                     | Auth Required |
| ---- | ---------------------- | --------------------------------- | ---------------------------- | -------- |
| GET  | `/api/smbPath`         | Change Samba share path to root directory       | `enable=1/0` enable or disable      | Yes      |
| GET  | `/api/hasTTYD`         | Check if TTYD service exists            | `port=port_number`                | Yes      |
| GET  | `/api/quick_shell` | Launch one-click engineering mode + execute script   | No parameters                       | Yes      |
| POST | `/api/root_shell`      | Send command to Root Shell Socket for execution | JSON: `{ "command": "..." }` | Yes      |

------



### Reverse Proxy Module （Any Proxy Module）

**Reverse proxy endpoint**，Used to forward client requests to a specified target address and return the response. Path format:

```shell
GET /api/proxy/--http://example.com/api/xxx
```

#### Supported request methods:`GET` `POST` `PUT` `PATCH`

Request body (e.g., POST JSON) will be forwarded as-is to the target address.

**Notes:**

1. This endpoint also requires auth verification
2. To avoid conflicts between UFI-TOOLS authToken and forwarded headers, proxy auth can use `kano-authorization` to carry the token (see table below)
3. To prevent internal network services from being exposed externally, the reverse proxy blocks internal address access by default
4. This endpoint has a fixed 30-second timeout; when exceeded, output is truncated and incomplete data is returned.

------

#### Customizable Request Headers (auto-forwarded):

- By default, **standard safe request headers** (such as `Accept`, `User-Agent`) are automatically forwarded.
- To manually inject sensitive headers (such as `Authorization`), use the **`kano-` prefix**:

| Custom Header Name         | Actually Forwarded As      |
| -------------------- | --------------- |
| `kano-Authorization` | `Authorization` |
| `kano-Cookie`        | `Cookie`        |

------

#### Response Handling:

- Normal response: returned in original format (with status code, Content-Type).
- HTML response: automatically rewrites resource paths starting with `/` (e.g., `/static/js/app.js`) to proxy paths, ensuring frontend pages load resources correctly.

------

#### Example:

```http
POST /api/proxy/--http://192.168.1.1/goform/login
Content-Type: application/json
kano-Authorization: Bearer abc123

{ "username": "admin", "password": "123456" }
```

Will be proxied as:

```http
POST http://192.168.1.1/goform/login
Authorization: Bearer abc123
Content-Type: application/json

{ "username": "admin", "password": "123456" }
```

------



### AT Command Module（AT Module）

| Method | Path      | Description                   | Parameters                                         | Auth Required |
| ---- | --------- | ---------------------- | ------------------------------------------------ | -------- |
| GET  | `/api/AT` | Execute AT command and return result | `command=AT_command` (required), `slot=SIM_slot (default 0)` | Yes      |

------



### Base Device Info Module（Base Device Info Module）

| Method | Path                  | Description                                            | Parameters | Auth Required |
| ---- | --------------------- | ----------------------------------------------- | -------- | -------- |
| GET  | `/api/baseDeviceInfo` | Get basic device info (battery, IP, CPU, memory, storage, etc.) | None       | Yes      |
| GET  | `/api/version_info`   | Get app version and device model                        | None       | No       |
| GET  | `/api/need_token`     | Check if login verification (token) is enabled                   | None       | No       |

------

The `otaModule` is a complete OTA (Over-The-Air) update module built with Ktor web service, running in Android environment (embedded devices or phones), covering the following API endpoints:

------



### OTA Module（OTA Module）

| Method | Path                       | Description                      | Params    | Auth | Notes                                |
| ---- | -------------------------- | ------------------------- | --------- | ---- | ----------------------------------- |
| GET  | `/api/check_update`        | Fetch changelog and file list | None        | Yes  | Calls Alist API to get OTA package info      |
| POST | `/api/download_apk`        | Start downloading APK file         | {apk_url} | Yes  | Background thread download, supports status query          |
| GET  | `/api/download_apk_status` | Query download progress and status        | None        | Yes  | Download status, percentage, error info          |
| POST | `/api/install_apk`         | Install downloaded APK file     | None        | Yes  | Uses socat (root) or ADB (non-root) |

------



### Plugins Module （Plugins Module）

| Method | Path                   | Description               | Parameters                              | Auth Required |
| ---- | ---------------------- | ------------------ | --------------------------------------- | -------- |
| POST | `/api/set_custom_head` | Set custom header text | JSON: `{ "text": "..." }` (limit 1145KB) | Yes      |
| GET  | `/api/get_custom_head` | Get custom header text | None                                      | No       |

---



### SMS Forward Module （SMS Forward Module）

| Method | Path                       | Description                   | Parameters                                                   | Auth Required |
| ---- | -------------------------- | ---------------------- | ------------------------------------------------------------ | -------- |
| GET  | `/api/sms_forward_method`  | Get current SMS forward method   | None                                                           | Yes      |
| POST | `/api/sms_forward_mail`    | Configure email SMS forwarding | {`smtp_host`, `smtp_port`, `smtp_to`, `smtp_username`, `smtp_password`} | Yes      |
| GET  | `/api/sms_forward_mail`    | Get email forward configuration       | None                                                           | Yes      |
| POST | `/api/sms_forward_curl`    | Configure CURL forwarding   | {`curl_text`}(must contain `{{sms-body}}`, `{{sms-time}}`, `{{sms-from}}`) | Yes      |
| GET  | `/api/sms_forward_curl`    | Get CURL forward configuration     | None                                                           | Yes      |
| POST | `/api/sms_forward_dingtalk` | Configure DingTalk webhook forwarding | {`webhook_url`, `secret`}(`secret` is an optional signing key) | Yes      |
| GET  | `/api/sms_forward_dingtalk` | Get DingTalk webhook forward configuration | None                                                           | Yes      |
| POST | `/api/sms_forward_enabled` | Set SMS forward master switch     | Query parameter: `enable` (string)                               | Yes      |
| GET  | `/api/sms_forward_enabled` | Get SMS forward switch status   | None                                                           | Yes      |

---



### Speedtest Module （Speedtest Module）

| Method | Path             | Description                 | Parameters                              | Auth Required |
| ---- | ---------------- | -------------------- | -------------------------------------- | -------- |
| GET  | `/api/speedtest` | Download speed test data (rate-limited) | Query: `ckSize` (chunk count), `cors` optional | Yes      |

---



### Theme Module （Theme Module）

| Method | Path              | Description                       | Parameters (Brief)                                               | Auth Required |
| ---- | ----------------- | -------------------------- | ---------------------------------------------------------- | -------- |
| POST | `/api/upload_img` | Upload image, return image access URL | Multipart form, image file                                   | Yes      |
| POST | `/api/delete_img` | Delete image                   | JSON, `file_name`: filename to delete                          | Yes      |
| POST | `/api/set_theme`  | Save theme configuration               | JSON, Theme config fields (e.g., `backgroundEnabled`, `textColor`, etc.) | Yes      |
| GET  | `/api/get_theme`  | Get current theme configuration           | None                                                         | No       |

------

#### Additional Notes:

- Uploaded images are saved to `filesDir/uploads/` directory, accessible via `/api/uploads/filename`.

------



### Official Web Reverse Proxy Module （ReverseProxy Module）

| Method | Path                | Description             | Parameters                              | Auth Required       |
| ---- | ------------------- | ---------------- | --------------------------------------- | -------------- |
| All | `/api/goform/{...}` | Proxy official Web API | Request path + query params + body (POST/PUT) | No separate auth needed |

------

#### Details

- **Path Rules**：All requests starting with `/api/goform/` will be proxied and forwarded.
- **Target Server Address**：Specified via `targetServerIP` parameter (e.g., `192.168.0.1`), requests forwarded to `http://targetServerIP`.
- **Request Header Forwarding**：Except `Host` and `Referer`, all request headers are forwarded to the target server, and `Referer` is forced to the target server address.
- **Supported Methods**：Supports GET, POST, PUT, OPTIONS method forwarding.
- **Request Body Forwarding**：POST and PUT request bodies are read and written to the proxy request.
- **Response Header Handling**：
  - **Renames the `Set-Cookie` header returned by the target server to `kano-cookie` and forwards it back to the client.**
  - Automatically adds CORS response headers to allow cross-origin requests.
- **Error Handling**：Catches all exceptions, returns 500 error with exception info.