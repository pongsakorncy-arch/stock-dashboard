"use client";

import { useEffect, useMemo, useState } from "react";

type Position = {
  ticker: string;
  shares: number;
  avgCost: number;
  currentPrice: number;
};

type WatchItem = {
  ticker: string;
  currentPrice: number;
};

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
  "#22c55e",
  "#3b82f6",
  "#eab308",
  "#ef4444",
  "#a855f7",
  "#14b8a6",
  "#f97316",
  "#ec4899",
];

const money = (value: number) =>
  value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });

export default function PortfolioPage() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [watchlist, setWatchlist] = useState<WatchItem[]>([]);

  const [ticker, setTicker] = useState("");
  const [shares, setShares] = useState("");
  const [price, setPrice] = useState("");
  const [mode, setMode] = useState<"buy" | "sell">("buy");

  const [watchTicker, setWatchTicker] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    const savedPositions = localStorage.getItem("positions");
    const savedWatchlist = localStorage.getItem("watchlist");

    if (savedPositions) {
      const parsed = JSON.parse(savedPositions);

      setPositions(
        parsed.map((p: any) => ({
          ticker: p.ticker,
          shares: Number(p.shares || 0),
          avgCost: Number(p.avgCost ?? p.cost ?? 0),
          currentPrice: Number(p.currentPrice || 0),
        }))
      );
    }

    if (savedWatchlist) {
      setWatchlist(JSON.parse(savedWatchlist));
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("positions", JSON.stringify(positions));
  }, [positions]);

  useEffect(() => {
    localStorage.setItem("watchlist", JSON.stringify(watchlist));
  }, [watchlist]);

  const totalCost = positions.reduce(
    (sum, p) => sum + p.shares * p.avgCost,
    0
  );

  const marketValue = positions.reduce(
    (sum, p) => sum + p.shares * p.currentPrice,
    0
  );

  const profit = marketValue - totalCost;
  const profitPercent = totalCost > 0 ? (profit / totalCost) * 100 : 0;

  const sortedPositions = useMemo(() => {
    return [...positions].sort(
      (a, b) => b.shares * b.currentPrice - a.shares * a.currentPrice
    );
  }, [positions]);

  const pieStyle = useMemo(() => {
    if (marketValue <= 0) return { background: "#27272a" };

    let start = 0;

    const slices = sortedPositions.map((p, index) => {
      const value = p.shares * p.currentPrice;
      const percent = (value / marketValue) * 100;
      const end = start + percent;
      const color = colors[index % colors.length];

      const slice = `${color} ${start}% ${end}%`;
      start = end;
      return slice;
    });

    return {
      background: `conic-gradient(${slices.join(", ")})`,
    };
  }, [sortedPositions, marketValue]);

  const getQuote = async (symbol: string) => {
    const apiKey = process.env.NEXT_PUBLIC_FINNHUB_API_KEY;

    if (!apiKey) {
      alert("Missing NEXT_PUBLIC_FINNHUB_API_KEY");
      return 0;
    }

    const res = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${apiKey}`
    );

    const data = await res.json();
    return Number(data.c || 0);
  };

  const refreshPrices = async () => {
    setIsRefreshing(true);

    const updatedPositions: Position[] = [];

    for (const p of positions) {
      const currentPrice = await getQuote(p.ticker);
      updatedPositions.push({
        ...p,
        currentPrice: currentPrice || p.currentPrice,
      });
    }

    const updatedWatchlist: WatchItem[] = [];

    for (const item of watchlist) {
      const currentPrice = await getQuote(item.ticker);
      updatedWatchlist.push({
        ...item,
        currentPrice: currentPrice || item.currentPrice,
      });
    }

    setPositions(updatedPositions);
    setWatchlist(updatedWatchlist);
    setIsRefreshing(false);
  };

  const handleTrade = () => {
    if (!ticker || !shares || !price) return;

    const symbol = ticker.toUpperCase();
    const qty = Number(shares);
    const tradePrice = Number(price);

    const existing = positions.find((p) => p.ticker === symbol);

    if (mode === "buy") {
      if (existing) {
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
      } else {
        setPositions([
          ...positions,
          {
            ticker: symbol,
            shares: qty,
            avgCost: tradePrice,
            currentPrice: tradePrice,
          },
        ]);
      }
    }

    if (mode === "sell" && existing) {
      const remainingShares = existing.shares - qty;

      if (remainingShares <= 0) {
        setPositions(positions.filter((p) => p.ticker !== symbol));
      } else {
        setPositions(
          positions.map((p) =>
            p.ticker === symbol
              ? {
                  ...p,
                  shares: remainingShares,
                }
              : p
          )
        );
      }
    }

    setTicker("");
    setShares("");
    setPrice("");
  };

  const loadMyPortfolio = () => {
    setPositions(myPortfolio);
  };

  const addWatch = () => {
    if (!watchTicker) return;

    const symbol = watchTicker.toUpperCase();

    if (watchlist.some((w) => w.ticker === symbol)) return;

    setWatchlist([...watchlist, { ticker: symbol, currentPrice: 0 }]);
    setWatchTicker("");
  };

  return (
    <main className="min-h-screen bg-black text-white p-6 pb-24">
      <h1 className="text-3xl font-bold mb-6">Portfolio</h1>

      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800">
          <p className="text-zinc-400 text-sm">Portfolio Value</p>
          <p className="text-2xl font-bold">{money(marketValue)}</p>
        </div>

        <div className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800">
          <p className="text-zinc-400 text-sm">Total Cost</p>
          <p className="text-2xl font-bold">{money(totalCost)}</p>
        </div>

        <div className="col-span-2 bg-zinc-900 rounded-2xl p-4 border border-zinc-800">
          <p className="text-zinc-400 text-sm">Profit / Loss</p>
          <p
            className={`text-3xl font-bold ${
              profit >= 0 ? "text-green-400" : "text-red-400"
            }`}
          >
            {money(profit)} ({profitPercent.toFixed(2)}%)
          </p>
        </div>
      </div>

      <div className="bg-zinc-900 rounded-2xl p-5 mb-6 border border-zinc-800">
        <p className="font-bold mb-4">Allocation</p>

        <div
          className="w-48 h-48 rounded-full mx-auto mb-5"
          style={pieStyle}
        />

        <div className="space-y-2">
          {sortedPositions.slice(0, 8).map((p, index) => {
            const value = p.shares * p.currentPrice;
            const allocation =
              marketValue > 0 ? (value / marketValue) * 100 : 0;

            return (
              <div
                key={p.ticker}
                className="flex justify-between text-sm"
              >
                <span>
                  <span
                    className="inline-block w-3 h-3 rounded-full mr-2"
                    style={{
                      background: colors[index % colors.length],
                    }}
                  />
                  {p.ticker}
                </span>

                <span className="text-zinc-400">
                  {allocation.toFixed(2)}%
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-6">
        <button
          onClick={loadMyPortfolio}
          className="bg-blue-600 p-3 rounded font-bold"
        >
          Load My Portfolio
        </button>

        <button
          onClick={() => setPositions([])}
          className="bg-zinc-800 p-3 rounded font-bold"
        >
          Clear
        </button>

        <button
          onClick={refreshPrices}
          disabled={isRefreshing}
          className="col-span-2 bg-yellow-400 text-black p-4 rounded font-bold disabled:opacity-50"
        >
          {isRefreshing ? "Refreshing..." : "Refresh Prices"}
        </button>
      </div>

      <div className="bg-zinc-900 rounded-2xl p-5 mb-6 border border-zinc-800">
        <p className="font-bold mb-4">Buy / Sell</p>

        <select
          className="w-full p-3 mb-3 bg-zinc-800 rounded"
          value={mode}
          onChange={(e) => setMode(e.target.value as "buy" | "sell")}
        >
          <option value="buy">Buy</option>
          <option value="sell">Sell</option>
        </select>

        <input
          className="w-full p-3 mb-3 bg-zinc-800 rounded"
          placeholder="Ticker"
          value={ticker}
          onChange={(e) => setTicker(e.target.value)}
        />

        <input
          className="w-full p-3 mb-3 bg-zinc-800 rounded"
          placeholder="Shares"
          type="number"
          value={shares}
          onChange={(e) => setShares(e.target.value)}
        />

        <input
          className="w-full p-3 mb-3 bg-zinc-800 rounded"
          placeholder="Price"
          type="number"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />

        <button
          onClick={handleTrade}
          className="w-full bg-green-600 p-3 rounded font-bold"
        >
          Save Trade
        </button>
      </div>

      <div className="space-y-3 mb-6">
        {sortedPositions.map((p) => {
          const value = p.shares * p.currentPrice;
          const costValue = p.shares * p.avgCost;
          const pl = value - costValue;
          const allocation =
            marketValue > 0 ? (value / marketValue) * 100 : 0;

          return (
            <div
              key={p.ticker}
              className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800"
            >
              <div className="flex justify-between">
                <div>
                  <h2 className="text-xl font-bold">{p.ticker}</h2>
                  <p className="text-zinc-400">
                    {p.shares.toFixed(3)} shares
                  </p>
                  <p className="text-zinc-400">
                    Avg Cost: {money(p.avgCost)}
                  </p>
                  <p className="text-zinc-400">
                    Current: {money(p.currentPrice)}
                  </p>
                </div>

                <div className="text-right">
                  <p className="font-bold">{money(value)}</p>
                  <p
                    className={
                      pl >= 0 ? "text-green-400" : "text-red-400"
                    }
                  >
                    {money(pl)}
                  </p>
                  <p className="text-zinc-400">
                    {allocation.toFixed(2)}%
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-zinc-900 rounded-2xl p-5 border border-zinc-800">
        <p className="font-bold mb-4">Watchlist</p>

        <div className="flex gap-2 mb-4">
          <input
            className="w-full p-3 bg-zinc-800 rounded"
            placeholder="Ticker"
            value={watchTicker}
            onChange={(e) => setWatchTicker(e.target.value)}
          />

          <button
            onClick={addWatch}
            className="bg-blue-600 px-4 rounded font-bold"
          >
            Add
          </button>
        </div>

        <div className="space-y-2">
          {watchlist.map((w) => (
            <div
              key={w.ticker}
              className="flex justify-between border-b border-zinc-800 py-2"
            >
              <span>{w.ticker}</span>
              <span>{money(w.currentPrice)}</span>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
