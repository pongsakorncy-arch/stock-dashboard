"use client";

import { useEffect, useState } from "react";

type Position = {
  ticker: string;
  shares: number;
  cost: number;
  currentPrice: number;
};

const myPortfolio: Position[] = [
  { ticker: "ALAB", shares: 3.7271679, cost: 0, currentPrice: 0 },
  { ticker: "ASML", shares: 1.120274, cost: 0, currentPrice: 0 },
  { ticker: "TSM", shares: 1.3873869, cost: 0, currentPrice: 0 },
  { ticker: "AMD", shares: 2.4819359, cost: 0, currentPrice: 0 },
  { ticker: "RBRK", shares: 22.4047329, cost: 0, currentPrice: 0 },
  { ticker: "GOOGL", shares: 7.1646262, cost: 0, currentPrice: 0 },
  { ticker: "CRWD", shares: 0.8078283, cost: 0, currentPrice: 0 },
  { ticker: "TMDX", shares: 5.6205782, cost: 0, currentPrice: 0 },
  { ticker: "SOFI", shares: 63.2978785, cost: 0, currentPrice: 0 },
  { ticker: "RKLB", shares: 5.4644484, cost: 0, currentPrice: 0 },
  { ticker: "NVO", shares: 34.6614128, cost: 0, currentPrice: 0 },
  { ticker: "NVDA", shares: 7.9079846, cost: 0, currentPrice: 0 },
  { ticker: "PLTR", shares: 7.560984, cost: 0, currentPrice: 0 },
  { ticker: "NFLX", shares: 17.7666769, cost: 0, currentPrice: 0 },
  { ticker: "IONQ", shares: 12.3795114, cost: 0, currentPrice: 0 },
  { ticker: "UBER", shares: 8.1490212, cost: 0, currentPrice: 0 },
  { ticker: "AMZN", shares: 10.5848651, cost: 0, currentPrice: 0 },
  { ticker: "MSFT", shares: 4.5660891, cost: 0, currentPrice: 0 },
  { ticker: "META", shares: 2.9587672, cost: 0, currentPrice: 0 },
];

const money = (value: number) =>
  value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });

export default function PortfolioPage() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("positions");
    if (saved) setPositions(JSON.parse(saved));
  }, []);

  useEffect(() => {
    localStorage.setItem("positions", JSON.stringify(positions));
  }, [positions]);

  const totalCost = positions.reduce(
    (sum, p) => sum + p.shares * p.cost,
    0
  );

  const marketValue = positions.reduce(
    (sum, p) => sum + p.shares * p.currentPrice,
    0
  );

  const profit = marketValue - totalCost;

  const loadMyPortfolio = () => {
    setPositions(myPortfolio);
  };

  const clearAll = () => {
    if (confirm("Clear all portfolio?")) {
      setPositions([]);
    }
  };

  const refreshPrices = async () => {
    const apiKey = process.env.NEXT_PUBLIC_FINNHUB_API_KEY;

    if (!apiKey) {
      alert("ไม่เจอ NEXT_PUBLIC_FINNHUB_API_KEY ใน .env.local");
      return;
    }

    setIsRefreshing(true);

    const updated = [];

    for (const position of positions) {
      try {
        const res = await fetch(
          `https://finnhub.io/api/v1/quote?symbol=${position.ticker}&token=${apiKey}`
        );

        const data = await res.json();

        updated.push({
          ...position,
          currentPrice: Number(data.c || 0),
        });
      } catch {
        updated.push(position);
      }
    }

    setPositions(updated);
    setIsRefreshing(false);
  };

  return (
    <main className="min-h-screen bg-black text-white p-6 pb-24">
      <h1 className="text-3xl font-bold mb-6">Portfolio</h1>

      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-zinc-900 rounded-2xl p-4">
          <p className="text-zinc-400 text-sm">Positions</p>
          <p className="text-2xl font-bold">{positions.length}</p>
        </div>

        <div className="bg-zinc-900 rounded-2xl p-4">
          <p className="text-zinc-400 text-sm">Market Value</p>
          <p className="text-2xl font-bold">{money(marketValue)}</p>
        </div>

        <div className="bg-zinc-900 rounded-2xl p-4">
          <p className="text-zinc-400 text-sm">Total Cost</p>
          <p className="text-2xl font-bold">{money(totalCost)}</p>
        </div>

        <div className="bg-zinc-900 rounded-2xl p-4">
          <p className="text-zinc-400 text-sm">Profit</p>
          <p className={profit >= 0 ? "text-green-400 text-2xl font-bold" : "text-red-400 text-2xl font-bold"}>
            {money(profit)}
          </p>
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
          onClick={clearAll}
          className="bg-zinc-800 p-3 rounded font-bold"
        >
          Clear All
        </button>

        <button
          onClick={refreshPrices}
          disabled={isRefreshing || positions.length === 0}
          className="col-span-2 bg-yellow-400 text-black p-4 rounded font-bold disabled:opacity-50"
        >
          {isRefreshing ? "Refreshing Prices..." : "Refresh Prices"}
        </button>
      </div>

      <div className="space-y-3">
        {positions.map((position, index) => {
          const value = position.shares * position.currentPrice;

          return (
            <div
              key={position.ticker}
              className="bg-zinc-900 rounded-2xl p-4"
            >
              <div className="flex justify-between">
                <div>
                  <h2 className="font-bold text-xl">{position.ticker}</h2>
                  <p className="text-zinc-400">
                    {position.shares.toFixed(3)} shares
                  </p>
                  <p className="text-zinc-400">
                    Current: {money(position.currentPrice)}
                  </p>
                  <p className="text-green-400 font-bold">
                    Value: {money(value)}
                  </p>
                </div>

                <button
                  onClick={() =>
                    setPositions(positions.filter((_, i) => i !== index))
                  }
                  className="bg-red-600 px-3 py-2 rounded h-fit"
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}