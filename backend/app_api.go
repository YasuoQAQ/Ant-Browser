package backend

import (
	"ant-chrome/backend/internal/browser"
	"ant-chrome/backend/internal/launchcode"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"strings"
	"time"
)

// ============================================================================
// ProfileCreator 接口实现
// ============================================================================

func (a *App) CreateProfile(input browser.ProfileInput) (*browser.Profile, error) {
	return a.browserMgr.Create(input)
}

func (a *App) UpdateProfile(profileId string, input browser.ProfileInput) (*browser.Profile, error) {
	return a.browserMgr.Update(profileId, input)
}

func (a *App) DeleteProfile(profileId string) error {
	return a.browserMgr.Delete(profileId)
}

func (a *App) ListProfiles() []browser.Profile {
	return a.browserMgr.List()
}

func (a *App) GetProfile(profileId string) (*browser.Profile, error) {
	a.browserMgr.Mutex.Lock()
	defer a.browserMgr.Mutex.Unlock()
	profile, exists := a.browserMgr.Profiles[profileId]
	if !exists {
		return nil, fmt.Errorf("profile not found")
	}
	return profile, nil
}

// ============================================================================
// BrowserStopper 接口实现
// ============================================================================

func (a *App) StopInstance(profileId string) (*browser.Profile, error) {
	return a.BrowserInstanceStop(profileId)
}

// ============================================================================
// CookieManager 接口实现（通过 CDP 协议）
// ============================================================================

func (a *App) GetCookies(profileId string, urls []string) ([]map[string]interface{}, error) {
	a.browserMgr.Mutex.Lock()
	profile, exists := a.browserMgr.Profiles[profileId]
	a.browserMgr.Mutex.Unlock()

	if !exists {
		return nil, fmt.Errorf("profile not found")
	}
	if !profile.Running || profile.DebugPort == 0 {
		return nil, fmt.Errorf("实例未运行，无法获取 Cookie")
	}

	return cdpGetCookies(profile.DebugPort, urls)
}

func (a *App) SetCookies(profileId string, cookies []map[string]interface{}) error {
	a.browserMgr.Mutex.Lock()
	profile, exists := a.browserMgr.Profiles[profileId]
	a.browserMgr.Mutex.Unlock()

	if !exists {
		return fmt.Errorf("profile not found")
	}
	if !profile.Running || profile.DebugPort == 0 {
		return fmt.Errorf("实例未运行，无法设置 Cookie")
	}

	return cdpSetCookies(profile.DebugPort, cookies)
}

func (a *App) ClearCookies(profileId string) error {
	a.browserMgr.Mutex.Lock()
	profile, exists := a.browserMgr.Profiles[profileId]
	a.browserMgr.Mutex.Unlock()

	if !exists {
		return fmt.Errorf("profile not found")
	}
	if !profile.Running || profile.DebugPort == 0 {
		return fmt.Errorf("实例未运行，无法清除 Cookie")
	}

	return cdpClearCookies(profile.DebugPort)
}

// ============================================================================
// CDP Cookie 操作（通过 Chrome DevTools Protocol HTTP API）
// ============================================================================

func cdpGetCookies(debugPort int, urls []string) ([]map[string]interface{}, error) {
	// 获取第一个 target 的 WebSocket URL
	targetURL := fmt.Sprintf("http://127.0.0.1:%d/json", debugPort)
	resp, err := http.Get(targetURL)
	if err != nil {
		return nil, fmt.Errorf("CDP 连接失败: %w", err)
	}
	defer resp.Body.Close()

	var targets []map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&targets); err != nil {
		return nil, fmt.Errorf("CDP 目标解析失败: %w", err)
	}
	if len(targets) == 0 {
		return nil, fmt.Errorf("没有可用的浏览器标签页")
	}

	// 通过 HTTP 接口调用 CDP 命令
	params := map[string]interface{}{}
	if len(urls) > 0 {
		params["urls"] = urls
	}

	result, err := cdpSendCommand(debugPort, "Network.getCookies", params)
	if err != nil {
		return nil, err
	}

	cookies, ok := result["cookies"].([]interface{})
	if !ok {
		return []map[string]interface{}{}, nil
	}

	cookieList := make([]map[string]interface{}, 0, len(cookies))
	for _, c := range cookies {
		if cm, ok := c.(map[string]interface{}); ok {
			cookieList = append(cookieList, cm)
		}
	}
	return cookieList, nil
}

func cdpSetCookies(debugPort int, cookies []map[string]interface{}) error {
	params := map[string]interface{}{
		"cookies": cookies,
	}
	_, err := cdpSendCommand(debugPort, "Network.setCookies", params)
	return err
}

func cdpClearCookies(debugPort int) error {
	_, err := cdpSendCommand(debugPort, "Network.clearBrowserCookies", map[string]interface{}{})
	return err
}

// cdpSendCommand 通过 CDP HTTP 接口发送命令
func cdpSendCommand(debugPort int, method string, params map[string]interface{}) (map[string]interface{}, error) {
	// 获取第一个 page target
	targetURL := fmt.Sprintf("http://127.0.0.1:%d/json", debugPort)
	resp, err := http.Get(targetURL)
	if err != nil {
		return nil, fmt.Errorf("CDP 连接失败: %w", err)
	}
	defer resp.Body.Close()

	var targets []map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&targets); err != nil {
		return nil, fmt.Errorf("CDP 目标解析失败: %w", err)
	}

	// 找到第一个 page 类型的 target
	var wsURL string
	for _, t := range targets {
		if t["type"] == "page" {
			if ws, ok := t["webSocketDebuggerUrl"].(string); ok {
				wsURL = ws
				break
			}
		}
	}
	if wsURL == "" {
		return nil, fmt.Errorf("没有可用的 page target")
	}

	// 使用 HTTP 协议版本的 CDP（/json/protocol 不需要 WebSocket）
	// 改用简单的 HTTP POST 到 CDP endpoint
	cmdURL := fmt.Sprintf("http://127.0.0.1:%d/json/protocol", debugPort)
	_ = cmdURL

	// 实际上 Chrome 的 CDP 需要 WebSocket，这里用一个简化方案：
	// 通过 /json/new 创建临时 target 来执行命令
	// 更好的方案是直接用 HTTP API

	// 使用 Chrome 的 HTTP API 来操作 cookies
	// Chrome 提供了 /json/version 和基本的 HTTP 接口
	// 但 cookie 操作需要 WebSocket，这里用 fetch API 的方式

	// 简化实现：通过 Runtime.evaluate 执行 JS 来操作 cookie
	// 对于 Network.getCookies 等命令，需要 WebSocket 连接
	// 这里使用 Go 的 gorilla/websocket 或简单的 net 包

	// 使用简单的 TCP WebSocket 实现
	return cdpWebSocketCommand(wsURL, method, params)
}

// cdpWebSocketCommand 通过 WebSocket 发送 CDP 命令
func cdpWebSocketCommand(wsURL string, method string, params map[string]interface{}) (map[string]interface{}, error) {
	// 解析 WebSocket URL
	wsURL = strings.Replace(wsURL, "ws://", "", 1)
	parts := strings.SplitN(wsURL, "/", 2)
	if len(parts) < 2 {
		return nil, fmt.Errorf("无效的 WebSocket URL")
	}

	host := parts[0]
	path := "/" + parts[1]

	// 建立 TCP 连接
	conn, err := (&net.Dialer{Timeout: 5 * time.Second}).Dial("tcp", host)
	if err != nil {
		return nil, fmt.Errorf("WebSocket 连接失败: %w", err)
	}
	defer conn.Close()

	// WebSocket 握手
	key := "dGhlIHNhbXBsZSBub25jZQ==" // 固定 key 用于简单实现
	handshake := fmt.Sprintf("GET %s HTTP/1.1\r\nHost: %s\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: %s\r\nSec-WebSocket-Version: 13\r\n\r\n", path, host, key)
	conn.Write([]byte(handshake))

	// 读取握手响应
	conn.SetReadDeadline(time.Now().Add(5 * time.Second))
	respBuf := make([]byte, 4096)
	n, err := conn.Read(respBuf)
	if err != nil {
		return nil, fmt.Errorf("WebSocket 握手失败: %w", err)
	}
	if !strings.Contains(string(respBuf[:n]), "101") {
		return nil, fmt.Errorf("WebSocket 握手被拒绝")
	}

	// 发送 CDP 命令
	cmd := map[string]interface{}{
		"id":     1,
		"method": method,
		"params": params,
	}
	cmdJSON, _ := json.Marshal(cmd)

	// 构建 WebSocket 帧（text frame, masked）
	frame := buildWSFrame(cmdJSON)
	conn.SetWriteDeadline(time.Now().Add(5 * time.Second))
	conn.Write(frame)

	// 读取响应
	conn.SetReadDeadline(time.Now().Add(10 * time.Second))
	resultBuf := make([]byte, 0, 65536)
	tmp := make([]byte, 65536)
	for {
		rn, rerr := conn.Read(tmp)
		if rn > 0 {
			resultBuf = append(resultBuf, tmp[:rn]...)
			// 尝试解析 WebSocket 帧
			payload := parseWSFrame(resultBuf)
			if payload != nil {
				var result map[string]interface{}
				if err := json.Unmarshal(payload, &result); err == nil {
					if id, ok := result["id"]; ok && fmt.Sprint(id) == "1" {
						if r, ok := result["result"].(map[string]interface{}); ok {
							return r, nil
						}
						if errObj, ok := result["error"].(map[string]interface{}); ok {
							return nil, fmt.Errorf("CDP 错误: %v", errObj["message"])
						}
						return map[string]interface{}{}, nil
					}
				}
				resultBuf = resultBuf[:0] // 不是我们的响应，继续读
			}
		}
		if rerr != nil {
			return nil, fmt.Errorf("CDP 响应读取失败: %w", rerr)
		}
	}
}

// buildWSFrame 构建 WebSocket text frame (masked)
func buildWSFrame(payload []byte) []byte {
	frame := []byte{0x81} // FIN + text opcode
	length := len(payload)

	if length < 126 {
		frame = append(frame, byte(length)|0x80) // masked
	} else if length < 65536 {
		frame = append(frame, 126|0x80)
		frame = append(frame, byte(length>>8), byte(length))
	} else {
		frame = append(frame, 127|0x80)
		for i := 7; i >= 0; i-- {
			frame = append(frame, byte(length>>(i*8)))
		}
	}

	// mask key
	mask := []byte{0x37, 0xfa, 0x21, 0x3d}
	frame = append(frame, mask...)

	// masked payload
	masked := make([]byte, length)
	for i := 0; i < length; i++ {
		masked[i] = payload[i] ^ mask[i%4]
	}
	frame = append(frame, masked...)

	return frame
}

// parseWSFrame 解析 WebSocket 帧，返回 payload（简化实现）
func parseWSFrame(data []byte) []byte {
	if len(data) < 2 {
		return nil
	}

	payloadLen := int(data[1] & 0x7F)
	masked := (data[1] & 0x80) != 0
	offset := 2

	if payloadLen == 126 {
		if len(data) < 4 {
			return nil
		}
		payloadLen = int(data[2])<<8 | int(data[3])
		offset = 4
	} else if payloadLen == 127 {
		if len(data) < 10 {
			return nil
		}
		payloadLen = 0
		for i := 0; i < 8; i++ {
			payloadLen = payloadLen<<8 | int(data[2+i])
		}
		offset = 10
	}

	if masked {
		offset += 4
	}

	if len(data) < offset+payloadLen {
		return nil
	}

	payload := make([]byte, payloadLen)
	copy(payload, data[offset:offset+payloadLen])

	if masked {
		maskKey := data[offset-4 : offset]
		for i := 0; i < payloadLen; i++ {
			payload[i] ^= maskKey[i%4]
		}
	}

	return payload
}

// ============================================================================
// API Server 集成
// ============================================================================

// GetAPIServerInfo 返回 API Server 信息（Wails 绑定）
func (a *App) GetAPIServerInfo() map[string]interface{} {
	if a.apiServer == nil {
		return map[string]interface{}{"ready": false}
	}
	return a.apiServer.GetInfo()
}

// 编译器检查接口实现
var _ launchcode.ProfileCreator = (*App)(nil)
var _ launchcode.BrowserStopper = (*App)(nil)
var _ launchcode.CookieManager = (*App)(nil)
