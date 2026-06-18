"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Position = {
  ticker: string;
  shares: number;
  avgCost: number;
  currentPrice: number;
};

type TradeMode = "buy" | "sell";

const myPortfolio: Position[] = [
  { ticker: "ALAB", shares: 3.7271679, avgCost: 0, currentPrice: 0 },
  { ticker: "ASML", shares: 1.120274, avgCost: 0, currentPrice: 0 },
  { ticker: "TSM", shares: 1.3873869, avgCost: 0, currentPrice: 0 },
  { ticker: "AMD", shares: 2.4819359, avgCost: 0, currentPrice: 0 },
  { ticker: "RBRK", shares: 22.4047329, avgCost: 0, currentPrice: 0 },
  { ticker: "GOOGL", shares: 7.1646262, avgCost: 0, currentPrice: 0 },
  { ticker: "CRWD", shares: 0.8078283, avgCost: 0, currentPrice: 0 },
  { ticker: "TMDX", shares: 5.6205782, avgCost: 0, currentPrice: 0 },
  { ticker: "SOFI", shares: 63.2978785, avgCost: 0, currentPrice: 0 },
  { ticker: "RKLB", shares: 5.4644484, avgCost: 0, currentPrice: 0 },
  { ticker: "NVO", shares: 34.6614128, avgCost: 0, currentPrice: 0 },
  { ticker: "NVDA", shares: 7.9079846, avgCost: 0, currentPrice: 0 },
  { ticker: "PLTR", shares: 7.560984, avgCost: 0, currentPrice: 0 },
  { ticker: "NFLX", shares: 17.7666769, avgCost: 0, currentPrice: 0 },
  { ticker: "IONQ", shares: 12.3795114, avgCost: 0, currentPrice: 0 },
  { ticker: "UBER", shares: 8.1490212, avgCost: 0, currentPrice: 0 },
  { ticker: "AMZN", shares: 10.5848651, avgCost: 0, currentPrice: 0 },
  { ticker: "MSFT", shares: 4.5660891, avgCost: 0, currentPrice: 0 },
  { ticker: "META", shares: 2.9587672, avgCost: 0, currentPrice: 0 },
];

const colors = [
  "#4f7df3",
  "#69c36b",
  "#f0aa4f",
  "#d43d52",
  "#9650e6",
  "#3b82f6",
  "#5fc46b",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
];

const money = (value: number) =>
  value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });

export default function PortfolioPage() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [mode, setMode] = useState<TradeMode>("buy");
  const [ticker, setTicker] = useState("");
  const [shares, setShares] = useState("");
  const [price, setPrice] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState("-");
  const autoRefreshed = useRef(false);

  useEffect(() => {
    const saved = localStorage.getItem("positions");

    if (saved) {
      const parsed = JSON.parse(saved);

      setPositions(
        parsed.map((p: any) => ({
          ticker: p.ticker,
          shares: Number(p.shares || 0),
          avgCost: Number(p.avgCost ?? p.cost ?? 0),
          currentPrice: Number(p.currentPrice || 0),
        }))
      );
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("positions", JSON.stringify(positions));
  }, [positions]);

  const totalCost = positions.reduce(
    (sum, p) => sum + p.shares * p.avgCost,
    0
  );

  const marketValue = positions.reduce(
    (sum, p) => sum + p.shares * p.currentPrice,
    0
  );

  const totalProfit = marketValue - totalCost;
  const profitPercent = totalCost > 0 ? (totalProfit / totalCost) * 100 : 0;

  const sortedPositions = useMemo(() => {
    return [...positions].sort(
      (a, b) => b.shares * b.currentPrice - a.shares * a.currentPrice
    );
  }, [positions]);

  const getQuote = async (symbol: string) => {
    const apiKey = process.env.NEXT_PUBLIC_FINNHUB_API_KEY;

    if (!apiKey) return 0;

    const res = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${apiKey}`
    );

    const data = await res.json();
    return Number(data.c || 0);
  };

  const refreshPrices = async () => {
    if (positions.length === 0) return;

    setIsRefreshing(true);

    const updated = await Promise.all(
      positions.map(async (p) => {
        const latest = await getQuote(p.ticker);

        return {
          ...p,
          currentPrice: latest || p.currentPrice,
        };
      })
    );

    setPositions(updated);
    setLastUpdated(new Date().toLocaleTimeString());
    setIsRefreshing(false);
  };

  useEffect(() => {
    if (positions.length > 0 && !autoRefreshed.current) {
      autoRefreshed.current = true;
      refreshPrices();
    }
  }, [positions.length]);

  const loadMyPortfolio = () => {
    setPositions(myPortfolio);
  };

  const clearPortfolio = () => {
    if (confirm("ล้างพอร์ตทั้งหมด?")) {
      setPositions([]);
    }
  };

  const saveTrade = () => {
    if (!ticker || !shares || !price) return;

    const symbol = ticker.toUpperCase();
    const qty = Number(shares);
    const tradePrice = Number(price);
    const existing = positions.find((p) => p.ticker === symbol);

    if (mode === "buy") {
      if (!existing) {
        setPositions([
          ...positions,
          {
            ticker: symbol,
            shares: qty,
            avgCost: tradePrice,
            currentPrice: tradePrice,
          },
        ]);
      } else {
        setPositions(
          positions.map((p) => {
            if (p.ticker !== symbol) return p;

            const oldCost = p.shares * p.avgCost;
            const newCost = qty * tradePrice;
            const newShares = p.shares + qty;

            return {
              ...p,
              shares: newShares,
              avgCost: (oldCost + newCost) / newShares,
            };
          })
        );
      }
    }

    if (mode === "sell" && existing) {
      const remaining = existing.shares - qty;

      if (remaining <= 0) {
        setPositions(positions.filter((p) => p.ticker !== symbol));
      } else {
        setPositions(
          positions.map((p) =>
            p.ticker === symbol ? { ...p, shares: remaining } : p
          )
        );
      }
    }

    setTicker("");
    setShares("");
    setPrice("");
  };

  const donutSlices = useMemo(() => {
    if (marketValue <= 0) return "#27272a 0% 100%";

    let start = 0;

    return sortedPositions
      .map((p, index) => {
        const value = p.shares * p.currentPrice;
        const percent = (value / marketValue) * 100;
        const end = start + percent;
        const color = colors[index % colors.length];
        const slice = `${color} ${start}% ${end}%`;
        start = end;
        return slice;
      })
      .join(", ");
  }, [marketValue, sortedPositions]);

  return (
    <main className="min-h-screen bg-[#111113] text-white p-4 pb-24">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-4">TRUSH YOUR OWN</h1>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          <div className="bg-[#1b1b1e] rounded-xl p-4">
            <p className="text-zinc-400 text-sm">มูลค่าพอร์ต</p>
            <p className="text-2xl font-bold">{money(marketValue)}</p>
          </div>

          <div className="bg-[#1b1b1e] rounded-xl p-4">
            <p className="text-zinc-400 text-sm">ต้นทุนรวม</p>
            <p className="text-2xl font-bold">{money(totalCost)}</p>
          </div>

          <div className="bg-[#1b1b1e] rounded-xl p-4">
            <p className="text-zinc-400 text-sm">กำไร/ขาดทุน</p>
            <p
              className={`text-2xl font-bold ${
                totalProfit >= 0 ? "text-green-400" : "text-red-400"
              }`}
            >
              {money(totalProfit)}
            </p>
          </div>

          <div className="bg-[#1b1b1e] rounded-xl p-4">
            <p className="text-zinc-400 text-sm">ผลตอบแทน</p>
            <p
              className={`text-2xl font-bold ${
                profitPercent >= 0 ? "text-green-400" : "text-red-400"
              }`}
            >
              {profitPercent.toFixed(2)}%
            </p>
          </div>
        </div>

        <div className="grid lg:grid-cols-[1fr_360px] gap-5">
          <div className="bg-[#1b1b1e] rounded-xl overflow-hidden">
            <div className="grid grid-cols-6 bg-[#18181b] text-sm font-bold text-zinc-300 p-3">
              <div>สัญลักษณ์</div>
              <div>ราคาเฉลี่ย</div>
              <div>มูลค่า ▼</div>
              <div>กำไร/ขาดทุน</div>
              <div>สัดส่วน</div>
              <div>จัดการ</div>
            </div>

            {sortedPositions.map((p, index) => {
              const value = p.shares * p.currentPrice;
              const costValue = p.shares * p.avgCost;
              const pl = value - costValue;
              const plPercent = costValue > 0 ? (pl / costValue) * 100 : 0;
              const allocation =
                marketValue > 0 ? (value / marketValue) * 100 : 0;

              return (
                <div
                  key={p.ticker}
                  className="grid grid-cols-6 items-center border-t border-zinc-800 p-3 text-sm"
                >
                  <div>
                    <p className="font-bold text-lg">{p.ticker}</p>
                    <p className="text-yellow-300">
                      {p.shares.toFixed(3)} หุ้น
                    </p>
                  </div>

                  <div className="font-bold">{money(p.avgCost)}</div>

                  <div className="font-bold">{money(value)}</div>

                  <div>
                    <p
                      className={`font-bold ${
                        pl >= 0 ? "text-green-400" : "text-red-400"
                      }`}
                    >
                      {money(pl)}
                    </p>
                    <p
                      className={
                        plPercent >= 0 ? "text-green-400" : "text-red-400"
                      }
                    >
                      ({plPercent.toFixed(2)}%)
                    </p>
                  </div>

                  <div>
                    <p className="text-red-400 font-bold">
                      {allocation.toFixed(2)}%
                    </p>
                    <div className="h-2 bg-zinc-700 rounded mt-1">
                      <div
                        className="h-2 bg-red-500 rounded"
                        style={{ width: `${Math.min(allocation, 100)}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setMode("buy");
                        setTicker(p.ticker);
                        setPrice(String(p.currentPrice || p.avgCost));
                      }}
                      className="text-yellow-300"
                    >
                      ซื้อ
                    </button>

                    <button
                      onClick={() => {
                        setMode("sell");
                        setTicker(p.ticker);
                        setPrice(String(p.currentPrice || p.avgCost));
                      }}
                      className="text-blue-400"
                    >
                      ขาย
                    </button>

                    <button
                      onClick={() =>
                        setPositions(
                          positions.filter((item) => item.ticker !== p.ticker)
                        )
                      }
                      className="text-red-400"
                    >
                      ลบ
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="bg-[#1b1b1e] rounded-xl p-5">
            <div className="relative w-72 h-72 mx-auto mb-5">
              <div
                className="w-72 h-72 rounded-full"
                style={{
                  background: `conic-gradient(${donutSlices})`,
                }}
              />

              <div className="absolute inset-10 bg-[#1b1b1e] rounded-full flex flex-col items-center justify-center">
                <p className="text-2xl font-bold">YOK</p>
                <p className="text-3xl font-bold">{money(marketValue)}</p>
                <p
                  className={`font-bold ${
                    totalProfit >= 0 ? "text-green-400" : "text-red-400"
                  }`}
                >
                  {money(totalProfit)}
                </p>
                <p
                  className={
                    profitPercent >= 0 ? "text-green-400" : "text-red-400"
                  }
                >
                  ({profitPercent.toFixed(2)}%)
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {sortedPositions.slice(0, 10).map((p, index) => (
                <div
                  key={p.ticker}
                  className="bg-[#111113] rounded px-2 py-1 text-sm flex items-center gap-2"
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ background: colors[index % colors.length] }}
                  />
                  {p.ticker}
                </div>
              ))}
            </div>

            <button
              onClick={refreshPrices}
              disabled={isRefreshing}
              className="w-full mt-5 bg-yellow-400 text-black p-3 rounded font-bold"
            >
              {isRefreshing ? "กำลังอัปเดตราคา..." : "อัปเดตราคาอัตโนมัติ"}
            </button>

            <p className="text-zinc-500 text-sm text-center mt-2">
              ล่าสุด: {lastUpdated}
            </p>
          </div>
        </div>

        <div className="bg-[#1b1b1e] rounded-xl p-5 mt-5">
          <p className="font-bold mb-4">ซื้อ / ขาย</p>

          <div className="grid md:grid-cols-5 gap-3">
            <select
              className="bg-[#111113] p-3 rounded"
              value={mode}
              onChange={(e) => setMode(e.target.value as TradeMode)}
            >
              <option value="buy">ซื้อ</option>
              <option value="sell">ขาย</option>
            </select>

            <input
              className="bg-[#111113] p-3 rounded"
              placeholder="Ticker"
              value={ticker}
              onChange={(e) => setTicker(e.target.value)}
            />

            <input
              className="bg-[#111113] p-3 rounded"
              placeholder="จำนวนหุ้น"
              type="number"
              value={shares}
              onChange={(e) => setShares(e.target.value)}
            />

            <input
              className="bg-[#111113] p-3 rounded"
              placeholder="ราคา"
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />

            <button
              onClick={saveTrade}
              className="bg-green-600 p-3 rounded font-bold"
            >
              บันทึก
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-4">
            <button
              onClick={loadMyPortfolio}
              className="bg-blue-600 p-3 rounded font-bold"
            >
              โหลดพอร์ตของฉัน
            </button>

            <button
              onClick={clearPortfolio}
              className="bg-zinc-800 p-3 rounded font-bold"
            >
              ล้างทั้งหมด
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
