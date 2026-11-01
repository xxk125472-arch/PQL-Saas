"""Interactive reset of the local SQLite database — only called by `start.cmd --reset-db`.

Resolves the database file the backend really uses (DATABASE_URL, default <repo>/data/app.db),
asks twice in Chinese, and only then deletes it (plus SQLite -wal/-shm/-journal side files).
start.cmd rebuilds the empty schema afterwards with init_db().

Exit codes: 0 = deleted or nothing to delete; 1 = cancelled or failed (start.cmd stops).
Run with apps/api as the working directory (start.cmd does a pushd).
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "apps" / "api"))

for stream in (sys.stdout, sys.stderr):
    try:
        stream.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass


def ask(prompt: str) -> str:
    try:
        return input(prompt).strip()
    except EOFError:  # no console attached (piped / scheduled) -> never treat as consent
        print()
        return ""


def cancel() -> int:
    print("  已取消，数据库保持不变。")
    return 1


def main() -> int:
    from app.core.config import settings

    url = settings.database_url
    if not url.startswith("sqlite:///"):
        print("[错误] 当前配置的数据库不是本地 SQLite 文件，--reset-db 不会处理，请手动清理。")
        return 1
    db = Path(url[len("sqlite:///"):]).resolve()

    print()
    print("============================== 警告 ==============================")
    print("  即将删除数据库文件：")
    print(f"    {db}")
    print("  其中所有账号、客户、事件、评分、导入记录、分析报告和设置")
    print("  都会被永久删除，无法恢复。删除后会自动重建一个空数据库。")
    print("==================================================================")
    if not db.exists():
        print("  该数据库文件目前不存在，无需删除，将直接新建。")
        return 0

    if ask("第一次确认：确定要清空数据库吗？输入 y 继续，其他任意键取消：").lower() != "y":
        return cancel()
    if ask("第二次确认：请输入大写 RESET 确认删除（输入其他内容取消）：") != "RESET":
        return cancel()

    try:
        db.unlink()
    except OSError:
        print("[错误] 无法删除数据库文件，它可能正被其他程序占用。")
        print("       请先关闭正在运行的 PQL Health（以及打开该文件的数据库工具），再重试。")
        return 1
    for suffix in ("-wal", "-shm", "-journal"):
        side = db.with_name(db.name + suffix)
        if side.exists():
            try:
                side.unlink()
            except OSError:
                pass
    print("  已删除数据库文件，接下来会重建空数据库。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
