import yfinance as yf
import mplfinance as mpf
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import requests
import os
from datetime import datetime
import pytz

# ============================================================
#  ⚙️  ตั้งค่าพอร์ตของคุณที่นี่
# ============================================================
PORTFOLIO = {
    "GOOGL": 6.8911295, "AMZN": 9.7533571, "ASML": 1.120274,
    "MSFT":  4.5660891, "META": 2.9587672, "NVDA": 7.9079846,
    "RBRK":  22.4047329, "NVO":  34.6614128, "NFLX": 17.7666769,
    "ALAB":  3.7271679, "UNH":   3.0889617, "AMD":  2.4819359,
    "SOFI":  63.2978785, "PLTR": 7.560984, "IONQ": 12.3795114,
    "UBER":  8.1490212, "TSM":   1.3873869, "CRWD": 0.8078283,
    "TMDX":  5.6205782, "RKLB":  3.6165177
}

TELEGRAM_TOKEN   = os.environ["TELEGRAM_TOKEN"]
TELEGRAM_CHAT_ID = os.environ["TELEGRAM_CHAT_ID"]
REPORT_TIMEZONE  = "Asia/Bangkok"

# ============================================================

def send_telegram_message(text: str):
    url = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage"
    requests.post(url, json={
        "chat_id": TELEGRAM_CHAT_ID,
        "text": text,
        "parse_mode": "HTML"
    })

def send_telegram_photo(photo_path: str, caption: str = ""):
    url = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendPhoto"
    with open(photo_path, "rb") as f:
        requests.post(url, data={
            "chat_id": TELEGRAM_CHAT_ID,
            "caption": caption,
            "parse_mode": "HTML"
        }, files={"photo": f})

def get_arrow(change: float) -> str:
    if change > 0:
        return "🟢▲"
    elif change < 0:
        return "🔴▼"
    return "⚪─"

def plot_candlestick_h1(ticker: str, hist) -> str:
    """วาดกราฟ Candlestick H1 dark theme"""

    hist["EMA20"] = hist["Close"].ewm(span=20).mean()
    hist["EMA50"] = hist["Close"].ewm(span=50).mean()

    mc = mpf.make_marketcolors(
        up="#26a69a", down="#ef5350",
        edge="inherit", wick="inherit",
        volume={"up": "#26a69a", "down": "#ef5350"},
    )
    style = mpf.make_mpf_style(
        base_mpf_style="nightclouds",
        marketcolors=mc,
        facecolor="#131722", edgecolor="#2a2e39",
        figcolor="#131722", gridcolor="#2a2e39",
        gridstyle="--", gridaxis="both",
        y_on_right=True,
        rc={
            "axes.labelcolor": "#d1d4dc",
            "xtick.color": "#787b86",
            "ytick.color": "#787b86",
            "font.family": "DejaVu Sans",
        }
    )

    apds = [
        mpf.make_addplot(hist["EMA20"], color="#f6c90e", width=1.2),
        mpf.make_addplot(hist["EMA50"], color="#2962ff", width=1.2),
    ]

    path = f"/tmp/{ticker}_chart.png"
    fig, axes = mpf.plot(
        hist,
        type="candle", style=style,
        addplot=apds, volume=True,
        ylabel="ราคา (USD)", ylabel_lower="ปริมาณ",
        figsize=(12, 7), panel_ratios=(3, 1),
        tight_layout=True, returnfig=True,
    )

    legend_patches = [
        mpatches.Patch(color="#f6c90e", label="EMA 20"),
        mpatches.Patch(color="#2962ff", label="EMA 50"),
    ]
    axes[0].legend(handles=legend_patches, loc="upper left",
                   facecolor="#1e222d", edgecolor="#2a2e39",
                   labelcolor="#d1d4dc", fontsize=9)
    axes[0].set_title(f"  {ticker}  —  H1  (7 วัน)",
                      loc="left", color="#d1d4dc",
                      fontsize=14, fontweight="bold", pad=10)

    fig.savefig(path, dpi=150, bbox_inches="tight",
                facecolor="#131722", edgecolor="none")
    plt.close(fig)
    return path

def format_large_number(n: float) -> str:
    if n >= 1_000_000_000_000:
        return f"${n/1_000_000_000_000:.2f}T"
    elif n >= 1_000_000_000:
        return f"${n/1_000_000_000:.2f}B"
    elif n >= 1_000_000:
        return f"${n/1_000_000:.2f}M"
    return f"${n:,.0f}"

# แปลงวันเป็นภาษาไทย
DAY_TH = {
    "Monday": "วันจันทร์", "Tuesday": "วันอังคาร",
    "Wednesday": "วันพุธ",  "Thursday": "วันพฤหัสบดี",
    "Friday": "วันศุกร์",   "Saturday": "วันเสาร์",
    "Sunday": "วันอาทิตย์"
}

def main():
    tz  = pytz.timezone(REPORT_TIMEZONE)
    now = datetime.now(tz)
    day_en   = now.strftime("%A")
    day_th   = DAY_TH.get(day_en, day_en)
    date_str = now.strftime(f"{day_th} %d/%m/%Y")

    header = (
        f"📊 <b>รายงานพอร์ตหุ้นประจำวัน</b>\n"
        f"🗓 {date_str}\n"
        f"{'─' * 30}\n"
    )
    send_telegram_message(header)

    total_value_now  = 0.0
    total_value_prev = 0.0

    for ticker, shares in PORTFOLIO.items():
        try:
            stock = yf.Ticker(ticker)
            info  = stock.info

            # H1 ย้อนหลัง 7 วัน
            hist = stock.history(period="7d", interval="1h")

            if hist.empty:
                send_telegram_message(f"⚠️ ไม่พบข้อมูล {ticker}")
                continue

            price_now  = hist["Close"].iloc[-1]
            price_prev = hist["Close"].iloc[-2] if len(hist) >= 2 else price_now
            change     = price_now - price_prev
            pct        = (change / price_prev) * 100
            arrow      = get_arrow(change)

            high_52w = info.get("fiftyTwoWeekHigh", 0)
            low_52w  = info.get("fiftyTwoWeekLow",  0)
            mkt_cap  = info.get("marketCap", 0)
            volume   = hist["Volume"].iloc[-1]

            position_value    = price_now * shares
            total_value_now  += position_value
            total_value_prev += price_prev * shares

            msg = (
                f"{arrow} <b>{ticker}</b>  —  ${price_now:.2f}\n"
                f"   เปลี่ยนแปลง: <b>{change:+.2f} ({pct:+.2f}%)</b>\n"
                f"   ถือ: {shares:.4f} หุ้น  │  มูลค่า: <b>${position_value:,.2f}</b>\n"
                f"   สูง/ต่ำ 52 สัปดาห์: ${high_52w:.2f} / ${low_52w:.2f}\n"
                f"   ปริมาณ: {volume:,.0f}  │  Mkt Cap: {format_large_number(mkt_cap)}\n"
            )

            chart_path = plot_candlestick_h1(ticker, hist)
            send_telegram_photo(chart_path, caption=msg)

        except Exception as e:
            send_telegram_message(f"❌ เกิดข้อผิดพลาด {ticker}: {e}")

    total_change   = total_value_now - total_value_prev
    total_pct      = (total_change / total_value_prev * 100) if total_value_prev else 0
    portfolio_arrow = get_arrow(total_change)

    summary = (
        f"\n{'─' * 30}\n"
        f"💼 <b>สรุปพอร์ตรวม</b>\n"
        f"   มูลค่ารวม: <b>${total_value_now:,.2f}</b>\n"
        f"   กำไร/ขาดทุนวันนี้: {portfolio_arrow} <b>{total_change:+,.2f} ({total_pct:+.2f}%)</b>\n"
        f"{'─' * 30}\n"
        f"⏰ อัปเดตเวลา: {now.strftime('%H:%M น. (เวลาไทย)')}"
    )
    send_telegram_message(summary)
    print("✅ ส่งรายงานเรียบร้อยแล้ว!")

if __name__ == "__main__":
    main()
