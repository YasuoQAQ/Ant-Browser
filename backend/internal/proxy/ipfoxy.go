package proxy

import (
	"ant-chrome/backend/internal/logger"
	"encoding/binary"
	"fmt"
	"io"
	"math/rand"
	"net"
	"strings"
	"sync"
	"time"
)

// IPFoxyBridgeManager 管理 IPFoxy 代理桥接（纯 Go 实现，无 Python 依赖）
// 链路: 浏览器 -> 本地HTTP代理(localPort) -> V2Ray SOCKS5 -> IPFoxy SOCKS5(带认证)
type IPFoxyBridgeManager struct {
	mu       sync.Mutex
	bridges  map[string]*IPFoxyBridge // key: proxyConfig
	v2rayURL string
}

type IPFoxyBridge struct {
	ProxyConfig string
	LocalPort   int
	LocalURL    string
	Listener    net.Listener
	RefCount    int
	stopCh      chan struct{}
}

// NewIPFoxyBridgeManager 创建 IPFoxy 桥接管理器
func NewIPFoxyBridgeManager(binDir string, v2rayURL string) *IPFoxyBridgeManager {
	return &IPFoxyBridgeManager{
		bridges:  make(map[string]*IPFoxyBridge),
		v2rayURL: v2rayURL,
	}
}

// IsIPFoxyProxy 判断是否为 IPFoxy 代理格式
// 支持两种格式：
//   - ipfoxy://host:port:username:password（显式前缀）
//   - host:port:username:password（host 包含 ipfoxy 关键词时自动识别）
func IsIPFoxyProxy(proxyConfig string) bool {
	lower := strings.ToLower(strings.TrimSpace(proxyConfig))
	if strings.HasPrefix(lower, "ipfoxy://") {
		return true
	}
	// 自动识别：域名包含 ipfoxy 且格式为 host:port:user:pass
	if strings.Contains(lower, "ipfoxy") {
		parts := strings.Split(strings.TrimSpace(proxyConfig), ":")
		if len(parts) >= 4 {
			return true
		}
	}
	return false
}

// SetV2RayURL 更新上游 V2Ray/SOCKS5 地址。
func (m *IPFoxyBridgeManager) SetV2RayURL(v2rayURL string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.v2rayURL = strings.TrimSpace(v2rayURL)
}

// EnsureBridge 确保 IPFoxy 桥接已启动，返回本地 HTTP 代理地址
func (m *IPFoxyBridgeManager) EnsureBridge(proxyConfig string) (string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	// 检查是否已有桥接
	if bridge, exists := m.bridges[proxyConfig]; exists {
		bridge.RefCount++
		return bridge.LocalURL, nil
	}

	// 解析 IPFoxy 配置
	host, port, username, password, err := parseIPFoxyConfig(proxyConfig)
	if err != nil {
		return "", fmt.Errorf("IPFoxy 配置解析失败: %w", err)
	}

	// 解析 V2Ray URL
	v2rayHost, v2rayPort, err := parseV2RayURL(m.v2rayURL)
	if err != nil {
		return "", fmt.Errorf("V2Ray 配置解析失败: %w", err)
	}

	// 测试 V2Ray 连通性
	testConn, err := net.DialTimeout("tcp", fmt.Sprintf("%s:%d", v2rayHost, v2rayPort), 3*time.Second)
	if err != nil {
		return "", fmt.Errorf("V2Ray 不可用 (%s:%d): %w。请确保 V2Ray 正在运行", v2rayHost, v2rayPort, err)
	}
	testConn.Close()

	// 启动本地 HTTP 代理监听
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return "", fmt.Errorf("本地端口分配失败: %w", err)
	}

	localPort := ln.Addr().(*net.TCPAddr).Port
	localURL := fmt.Sprintf("http://127.0.0.1:%d", localPort)
	stopCh := make(chan struct{})

	bridge := &IPFoxyBridge{
		ProxyConfig: proxyConfig,
		LocalPort:   localPort,
		LocalURL:    localURL,
		Listener:    ln,
		RefCount:    1,
		stopCh:      stopCh,
	}

	m.bridges[proxyConfig] = bridge

	// 启动代理服务
	go runIPFoxyProxy(ln, stopCh, v2rayHost, v2rayPort, host, port, username, password)

	log := logger.New("IPFoxy")
	log.Info("IPFoxy 桥接已启动",
		logger.F("local_url", localURL),
		logger.F("v2ray", fmt.Sprintf("%s:%d", v2rayHost, v2rayPort)),
		logger.F("ipfoxy", fmt.Sprintf("%s:%d", host, port)),
	)

	return localURL, nil
}

// ReleaseBridge 释放 IPFoxy 桥接引用
func (m *IPFoxyBridgeManager) ReleaseBridge(proxyConfig string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	bridge, exists := m.bridges[proxyConfig]
	if !exists {
		return
	}

	bridge.RefCount--
	if bridge.RefCount <= 0 {
		close(bridge.stopCh)
		bridge.Listener.Close()
		delete(m.bridges, proxyConfig)

		log := logger.New("IPFoxy")
		log.Info("IPFoxy 桥接已停止", logger.F("local_url", bridge.LocalURL))
	}
}

// Shutdown 关闭所有桥接
func (m *IPFoxyBridgeManager) Shutdown() {
	m.mu.Lock()
	defer m.mu.Unlock()

	for _, bridge := range m.bridges {
		close(bridge.stopCh)
		bridge.Listener.Close()
	}
	m.bridges = make(map[string]*IPFoxyBridge)
}

// runIPFoxyProxy 运行本地 HTTP 代理服务，将请求通过 V2Ray -> IPFoxy 转发
func runIPFoxyProxy(ln net.Listener, stopCh chan struct{}, v2rayHost string, v2rayPort int, ipfoxyHost string, ipfoxyPort int, ipfoxyUser string, ipfoxyPass string) {
	log := logger.New("IPFoxy")

	for {
		conn, err := ln.Accept()
		if err != nil {
			select {
			case <-stopCh:
				return
			default:
				log.Error("accept 失败", logger.F("error", err.Error()))
				continue
			}
		}

		go handleIPFoxyClient(conn, v2rayHost, v2rayPort, ipfoxyHost, ipfoxyPort, ipfoxyUser, ipfoxyPass)
	}
}

// handleIPFoxyClient 处理单个客户端连接
func handleIPFoxyClient(clientConn net.Conn, v2rayHost string, v2rayPort int, ipfoxyHost string, ipfoxyPort int, ipfoxyUser string, ipfoxyPass string) {
	defer clientConn.Close()

	clientConn.SetDeadline(time.Now().Add(30 * time.Second))

	// 读取 HTTP 请求头
	buf := make([]byte, 0, 4096)
	tmp := make([]byte, 4096)
	for {
		n, err := clientConn.Read(tmp)
		if err != nil {
			return
		}
		buf = append(buf, tmp[:n]...)
		if strings.Contains(string(buf), "\r\n\r\n") {
			break
		}
		if len(buf) > 65536 {
			return
		}
	}

	headerEnd := strings.Index(string(buf), "\r\n\r\n")
	if headerEnd < 0 {
		return
	}

	firstLine := strings.SplitN(string(buf), "\r\n", 2)[0]
	parts := strings.SplitN(firstLine, " ", 3)
	if len(parts) < 3 {
		return
	}

	method := parts[0]
	target := parts[1]

	// 生成带 session 的用户名
	sessionUser := fmt.Sprintf("%s-sessid-%d_%d", ipfoxyUser, time.Now().Unix(), rand.Intn(99999))

	clientConn.SetDeadline(time.Time{}) // 清除超时

	if method == "CONNECT" {
		// HTTPS 隧道
		hostPort := strings.SplitN(target, ":", 2)
		host := hostPort[0]
		portStr := "443"
		if len(hostPort) > 1 {
			portStr = hostPort[1]
		}
		handleIPFoxyConnect(clientConn, v2rayHost, v2rayPort, ipfoxyHost, ipfoxyPort, sessionUser, ipfoxyPass, host, portStr)
	} else {
		// HTTP 请求
		handleIPFoxyHTTP(clientConn, v2rayHost, v2rayPort, ipfoxyHost, ipfoxyPort, sessionUser, ipfoxyPass, method, target, buf)
	}
}

// handleIPFoxyConnect 处理 CONNECT 隧道
// 链路: client -> V2Ray SOCKS5 -> IPFoxy SOCKS5(认证) -> 目标
func handleIPFoxyConnect(clientConn net.Conn, v2rayHost string, v2rayPort int, ipfoxyHost string, ipfoxyPort int, ipfoxyUser string, ipfoxyPass string, targetHost string, targetPort string) {
	log := logger.New("IPFoxy")

	// 1. 通过 V2Ray SOCKS5 连接到 IPFoxy
	v2rayConn, err := socks5Connect(v2rayHost, v2rayPort, ipfoxyHost, ipfoxyPort)
	if err != nil {
		log.Error("V2Ray->IPFoxy 连接失败", logger.F("error", err.Error()))
		clientConn.Write([]byte("HTTP/1.1 502 Bad Gateway\r\n\r\n"))
		return
	}
	defer v2rayConn.Close()

	// 2. 通过 IPFoxy SOCKS5 认证连接到目标
	if err := socks5AuthConnect(v2rayConn, ipfoxyUser, ipfoxyPass, targetHost, targetPort); err != nil {
		log.Error("IPFoxy SOCKS5 认证/连接失败", logger.F("error", err.Error()), logger.F("target", targetHost+":"+targetPort))
		clientConn.Write([]byte("HTTP/1.1 502 Bad Gateway\r\n\r\n"))
		return
	}

	// 3. 告诉浏览器隧道已建立
	clientConn.Write([]byte("HTTP/1.1 200 Connection Established\r\n\r\n"))

	// 4. 双向转发
	relay(clientConn, v2rayConn)
}

// handleIPFoxyHTTP 处理普通 HTTP 请求
func handleIPFoxyHTTP(clientConn net.Conn, v2rayHost string, v2rayPort int, ipfoxyHost string, ipfoxyPort int, ipfoxyUser string, ipfoxyPass string, method string, url string, rawRequest []byte) {
	log := logger.New("IPFoxy")

	// 通过 V2Ray SOCKS5 连接到 IPFoxy
	v2rayConn, err := socks5Connect(v2rayHost, v2rayPort, ipfoxyHost, ipfoxyPort)
	if err != nil {
		log.Error("V2Ray->IPFoxy 连接失败(HTTP)", logger.F("error", err.Error()))
		clientConn.Write([]byte("HTTP/1.1 502 Bad Gateway\r\n\r\n"))
		return
	}
	defer v2rayConn.Close()

	// 通过 IPFoxy SOCKS5 认证后，IPFoxy 本身是 SOCKS5 代理
	// 需要解析 URL 中的 host:port，通过 SOCKS5 CONNECT 到目标 web 服务器
	// 然后把原始 HTTP 请求转发过去

	// 解析目标 host:port
	targetHost, targetPort := parseHTTPTarget(url)
	if targetHost == "" {
		clientConn.Write([]byte("HTTP/1.1 400 Bad Request\r\n\r\n"))
		return
	}

	if err := socks5AuthConnect(v2rayConn, ipfoxyUser, ipfoxyPass, targetHost, targetPort); err != nil {
		log.Error("IPFoxy SOCKS5 认证/连接失败(HTTP)", logger.F("error", err.Error()))
		clientConn.Write([]byte("HTTP/1.1 502 Bad Gateway\r\n\r\n"))
		return
	}

	// 转发原始请求
	v2rayConn_write_err := func() error {
		_, err := v2rayConn.Write(rawRequest)
		return err
	}()
	if v2rayConn_write_err != nil {
		clientConn.Write([]byte("HTTP/1.1 502 Bad Gateway\r\n\r\n"))
		return
	}

	// 双向转发
	relay(clientConn, v2rayConn)
}

// socks5Connect 通过 V2Ray SOCKS5 (无认证) 连接到目标
func socks5Connect(v2rayHost string, v2rayPort int, targetHost string, targetPort int) (net.Conn, error) {
	conn, err := net.DialTimeout("tcp", fmt.Sprintf("%s:%d", v2rayHost, v2rayPort), 15*time.Second)
	if err != nil {
		return nil, fmt.Errorf("连接 V2Ray 失败: %w", err)
	}

	// SOCKS5 握手 - 无认证
	conn.Write([]byte{0x05, 0x01, 0x00})
	resp := make([]byte, 2)
	if _, err := io.ReadFull(conn, resp); err != nil {
		conn.Close()
		return nil, fmt.Errorf("SOCKS5 握手失败: %w", err)
	}
	if resp[0] != 0x05 || resp[1] != 0x00 {
		conn.Close()
		return nil, fmt.Errorf("SOCKS5 握手失败: %x", resp)
	}

	// SOCKS5 CONNECT
	addrBytes := []byte(targetHost)
	req := make([]byte, 0, 7+len(addrBytes))
	req = append(req, 0x05, 0x01, 0x00, 0x03, byte(len(addrBytes)))
	req = append(req, addrBytes...)
	portBytes := make([]byte, 2)
	binary.BigEndian.PutUint16(portBytes, uint16(targetPort))
	req = append(req, portBytes...)
	conn.Write(req)

	// 读取响应
	connectResp := make([]byte, 4)
	if _, err := io.ReadFull(conn, connectResp); err != nil {
		conn.Close()
		return nil, fmt.Errorf("SOCKS5 CONNECT 响应读取失败: %w", err)
	}
	if connectResp[1] != 0x00 {
		conn.Close()
		return nil, fmt.Errorf("SOCKS5 CONNECT 失败, code=%d", connectResp[1])
	}

	// 消费剩余的绑定地址
	switch connectResp[3] {
	case 0x01: // IPv4
		discard := make([]byte, 4+2)
		io.ReadFull(conn, discard)
	case 0x03: // 域名
		lenBuf := make([]byte, 1)
		io.ReadFull(conn, lenBuf)
		discard := make([]byte, int(lenBuf[0])+2)
		io.ReadFull(conn, discard)
	case 0x04: // IPv6
		discard := make([]byte, 16+2)
		io.ReadFull(conn, discard)
	}

	conn.SetDeadline(time.Now().Add(60 * time.Second))
	return conn, nil
}

// socks5AuthConnect 通过 SOCKS5 带用户名密码认证连接到目标
func socks5AuthConnect(conn net.Conn, username string, password string, targetHost string, targetPort string) error {
	// SOCKS5 握手 - 用户名密码认证 (method 0x02)
	conn.Write([]byte{0x05, 0x01, 0x02})
	resp := make([]byte, 2)
	if _, err := io.ReadFull(conn, resp); err != nil {
		return fmt.Errorf("IPFoxy SOCKS5 握手失败: %w", err)
	}
	if resp[0] != 0x05 {
		return fmt.Errorf("IPFoxy SOCKS5 握手失败: %x", resp)
	}

	if resp[1] == 0x02 {
		// 发送用户名密码
		userBytes := []byte(username)
		passBytes := []byte(password)
		authReq := make([]byte, 0, 3+len(userBytes)+len(passBytes))
		authReq = append(authReq, 0x01, byte(len(userBytes)))
		authReq = append(authReq, userBytes...)
		authReq = append(authReq, byte(len(passBytes)))
		authReq = append(authReq, passBytes...)
		conn.Write(authReq)

		authResp := make([]byte, 2)
		if _, err := io.ReadFull(conn, authResp); err != nil {
			return fmt.Errorf("IPFoxy SOCKS5 认证响应读取失败: %w", err)
		}
		if authResp[1] != 0x00 {
			return fmt.Errorf("IPFoxy SOCKS5 认证失败, code=%d", authResp[1])
		}
	} else if resp[1] == 0xFF {
		return fmt.Errorf("IPFoxy 拒绝所有认证方式")
	}

	// SOCKS5 CONNECT 到目标
	addrBytes := []byte(targetHost)
	// 解析端口
	port := 443
	fmt.Sscanf(targetPort, "%d", &port)

	connectReq := make([]byte, 0, 7+len(addrBytes))
	connectReq = append(connectReq, 0x05, 0x01, 0x00, 0x03, byte(len(addrBytes)))
	connectReq = append(connectReq, addrBytes...)
	portBytes := make([]byte, 2)
	binary.BigEndian.PutUint16(portBytes, uint16(port))
	connectReq = append(connectReq, portBytes...)
	conn.Write(connectReq)

	connectResp := make([]byte, 256)
	n, err := conn.Read(connectResp)
	if err != nil || n < 2 {
		return fmt.Errorf("IPFoxy SOCKS5 CONNECT 响应读取失败")
	}
	if connectResp[1] != 0x00 {
		return fmt.Errorf("IPFoxy SOCKS5 CONNECT 失败, code=%d", connectResp[1])
	}

	return nil
}

// relay 双向转发数据
func relay(conn1 net.Conn, conn2 net.Conn) {
	done := make(chan struct{}, 2)

	copy := func(dst, src net.Conn) {
		defer func() { done <- struct{}{} }()
		buf := make([]byte, 32*1024)
		for {
			src.SetReadDeadline(time.Now().Add(60 * time.Second))
			n, err := src.Read(buf)
			if n > 0 {
				dst.SetWriteDeadline(time.Now().Add(30 * time.Second))
				if _, werr := dst.Write(buf[:n]); werr != nil {
					return
				}
			}
			if err != nil {
				return
			}
		}
	}

	go copy(conn1, conn2)
	go copy(conn2, conn1)

	<-done
	// 一方结束后关闭两端
	conn1.Close()
	conn2.Close()
	<-done
}

// parseHTTPTarget 从 HTTP URL 中解析 host:port
func parseHTTPTarget(url string) (host string, port string) {
	// 去掉 http://
	u := url
	if strings.HasPrefix(u, "http://") {
		u = u[7:]
	} else if strings.HasPrefix(u, "https://") {
		u = u[8:]
	}

	// 取 host:port 部分
	slashIdx := strings.Index(u, "/")
	if slashIdx >= 0 {
		u = u[:slashIdx]
	}

	if strings.Contains(u, ":") {
		parts := strings.SplitN(u, ":", 2)
		return parts[0], parts[1]
	}

	if strings.HasPrefix(url, "https://") {
		return u, "443"
	}
	return u, "80"
}

// parseIPFoxyConfig 解析 IPFoxy 配置
// 支持格式：
//   - ipfoxy://host:port:username:password
//   - host:port:username:password
func parseIPFoxyConfig(config string) (host string, port int, username string, password string, err error) {
	config = strings.TrimPrefix(config, "ipfoxy://")
	config = strings.TrimSpace(config)
	parts := strings.SplitN(config, ":", 4)
	if len(parts) < 4 {
		return "", 0, "", "", fmt.Errorf("格式错误，应为 host:port:username:password")
	}

	host = parts[0]
	portStr := parts[1]
	username = parts[2]
	password = parts[3]

	var portInt int
	if _, err := fmt.Sscanf(portStr, "%d", &portInt); err != nil {
		return "", 0, "", "", fmt.Errorf("端口格式错误: %s", portStr)
	}

	return host, portInt, username, password, nil
}

// parseV2RayURL 解析 V2Ray SOCKS5 URL
// 格式: socks5://host:port
func parseV2RayURL(url string) (host string, port int, err error) {
	url = strings.TrimPrefix(url, "socks5://")
	url = strings.TrimPrefix(url, "socks://")

	parts := strings.Split(url, ":")
	if len(parts) != 2 {
		return "", 0, fmt.Errorf("格式错误，应为 socks5://host:port")
	}

	host = parts[0]
	var portInt int
	if _, err := fmt.Sscanf(parts[1], "%d", &portInt); err != nil {
		return "", 0, fmt.Errorf("端口格式错误: %s", parts[1])
	}

	return host, portInt, nil
}
