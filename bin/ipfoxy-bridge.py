#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
IPFoxy 代理桥接服务
为 Ant Browser 提供 IPFoxy SOCKS5 认证代理的本地 HTTP 代理桥接
"""

import socket
import threading
import struct
import sys
import json
import time
import random

# 从命令行参数读取配置
if len(sys.argv) < 2:
    print(json.dumps({"error": "缺少配置参数"}))
    sys.exit(1)

try:
    config = json.loads(sys.argv[1])
except:
    print(json.dumps({"error": "配置参数格式错误"}))
    sys.exit(1)

# 配置
LOCAL_PORT = config.get("local_port", 0)  # 0 表示自动分配
V2RAY_HOST = config.get("v2ray_host", "127.0.0.1")
V2RAY_PORT = config.get("v2ray_port", 10808)
PROXY_HOST = config.get("proxy_host")
PROXY_PORT = config.get("proxy_port")
PROXY_USER = config.get("proxy_user")
PROXY_PASS = config.get("proxy_pass")

if not all([PROXY_HOST, PROXY_PORT, PROXY_USER, PROXY_PASS]):
    print(json.dumps({"error": "缺少必要的代理配置"}))
    sys.exit(1)


def socks5_connect_ipfoxy(target_host, target_port):
    """通过 V2Ray 连接 IPFoxy SOCKS5"""
    # 1. 连接 V2Ray
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(15)
    sock.connect((V2RAY_HOST, V2RAY_PORT))

    # 2. V2Ray SOCKS5 握手（无认证）
    sock.send(b'\x05\x01\x00')
    resp = sock.recv(2)
    if resp[0] != 0x05 or resp[1] != 0x00:
        sock.close()
        raise Exception(f"V2Ray SOCKS5 握手失败")

    # 3. 通过 V2Ray 连接到 IPFoxy
    addr_bytes = PROXY_HOST.encode('utf-8')
    req = b'\x05\x01\x00\x03' + bytes([len(addr_bytes)]) + addr_bytes + struct.pack('>H', PROXY_PORT)
    sock.send(req)
    resp = sock.recv(256)
    if len(resp) < 2 or resp[1] != 0x00:
        sock.close()
        raise Exception(f"V2Ray 连接 IPFoxy 失败")

    # 4. IPFoxy SOCKS5 握手（用户名密码认证）
    sock.send(b'\x05\x01\x02')
    resp = sock.recv(2)
    if len(resp) < 2 or resp[0] != 0x05 or resp[1] != 0x02:
        sock.close()
        raise Exception(f"IPFoxy SOCKS5 握手失败")

    # 5. IPFoxy 用户名密码认证
    user_bytes = PROXY_USER.encode('utf-8')
    pass_bytes = PROXY_PASS.encode('utf-8')
    auth_req = b'\x01' + bytes([len(user_bytes)]) + user_bytes + bytes([len(pass_bytes)]) + pass_bytes
    sock.send(auth_req)
    auth_resp = sock.recv(2)
    if len(auth_resp) < 2 or auth_resp[1] != 0x00:
        sock.close()
        raise Exception(f"IPFoxy 认证失败")

    # 6. 连接目标
    target_bytes = target_host.encode('utf-8')
    connect_req = b'\x05\x01\x00\x03' + bytes([len(target_bytes)]) + target_bytes + struct.pack('>H', target_port)
    sock.send(connect_req)
    connect_resp = sock.recv(256)
    if len(connect_resp) < 2 or connect_resp[1] != 0x00:
        sock.close()
        raise Exception(f"IPFoxy CONNECT 失败")

    sock.settimeout(60)
    return sock


def relay(src, dst):
    """双向转发数据"""
    try:
        while True:
            data = src.recv(65536)
            if not data:
                break
            dst.sendall(data)
    except:
        pass
    finally:
        try: src.close()
        except: pass
        try: dst.close()
        except: pass


def handle_client(client_sock):
    """处理客户端连接"""
    try:
        client_sock.settimeout(30)
        data = b''
        while b'\r\n\r\n' not in data:
            chunk = client_sock.recv(4096)
            if not chunk:
                client_sock.close()
                return
            data += chunk

        first_line = data.split(b'\r\n')[0].decode('utf-8', errors='replace')
        parts = first_line.split(' ')
        if len(parts) < 3:
            client_sock.close()
            return

        method = parts[0]
        target = parts[1]

        if method == 'CONNECT':
            # HTTPS 隧道
            host_port = target.split(':')
            host = host_port[0]
            port = int(host_port[1]) if len(host_port) > 1 else 443

            remote = socks5_connect_ipfoxy(host, port)
            client_sock.sendall(b'HTTP/1.1 200 Connection Established\r\n\r\n')

            t1 = threading.Thread(target=relay, args=(client_sock, remote), daemon=True)
            t2 = threading.Thread(target=relay, args=(remote, client_sock), daemon=True)
            t1.start()
            t2.start()
            t1.join()
            t2.join()
        else:
            # 不支持普通 HTTP
            client_sock.sendall(b'HTTP/1.1 501 Not Implemented\r\n\r\n')
            client_sock.close()
    except:
        try:
            client_sock.close()
        except:
            pass


def start_server():
    """启动本地代理服务器"""
    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server.bind(('127.0.0.1', LOCAL_PORT))
    server.listen(50)

    # 获取实际监听的端口
    actual_port = server.getsockname()[1]

    # 输出启动信息（JSON 格式，供 Ant Browser 读取）
    print(json.dumps({
        "status": "ready",
        "port": actual_port,
        "proxy": f"http://127.0.0.1:{actual_port}"
    }))
    sys.stdout.flush()

    while True:
        try:
            client_sock, addr = server.accept()
            t = threading.Thread(target=handle_client, args=(client_sock,), daemon=True)
            t.start()
        except KeyboardInterrupt:
            break
        except:
            pass

    server.close()


if __name__ == '__main__':
    try:
        start_server()
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)
