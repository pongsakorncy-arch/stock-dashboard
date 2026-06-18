"use client";

import { useEffect, useMemo, useState } from "react";
import BottomNav from "./components/BottomNav";

type Position = {
  ticker: string;
  shares: number;
  cost: number;
  currentPrice: number;
};

const money = (value: number) => {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
};

export default function Home() {
  const [positions, setPositions] = useState<Position[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem("positions");

    if (saved) {
      const parsed = JSON.parse(saved);

      const migrated = parsed.map((position: any) => ({
        ticker: position.ticker,
        shares: Number(position.shares || 0),
        cost: Number(position.cost || 0),
        currentPrice: Number(position.currentPrice || 0),
      }));

      setPositions(migrated);
    }
  }, []);

  const totalPositions = positions.length;

  const totalCost = positions.reduce(
    (sum, position) => sum + position.shares * position.cost,
    0
  );

  const marketValue = positions.reduce(
    (sum, position) => sum + position.shares * position.currentPrice,
    0
  );

  const profit = marketValue - totalCost;

  const profitPercent = totalCost > 0 ? (profit / totalCost) * 100 : 0;

  const topHolding = useMemo(() => {
    if (positions.length === 0) return null;

    return [...positions].sort(
      (a, b) => b.shares * b.currentPrice - a.shares * a.currentPrice
    )[0];
  }, [positions]);

  const biggestPositionValue = topHolding
    ? topHolding.shares * topHolding.currentPrice
    : 0;

  return (
    <main className="min-h-screen bg-black text-white p-6 pb-24">
      <h1 className="text-3xl font-bold mb-2">Stock Dashboard</h1>

      <p className="text-zinc-400 mb-6">
        My Personal Portfolio
      </p>

      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="col-span-2 bg-zinc-900 rounded-2xl p-5 border border-zinc-800">
          <p className="text-zinc-400 text-sm">Portfolio Value</p>
          <h2 className="text-4xl font-bold mt-2">
            {money(marketValue)}
          </h2>
        </div>

        <div className="bg-zinc-900 rounded-2xl p-5 border border-zinc-800">
          <p className="text-zinc-400 text-sm">Total Cost</p>
          <h2 className="text-2xl font-bold mt-2">
            {money(totalCost)}
          </h2>
        </div>

        <div className="bg-zinc-900 rounded-2xl p-5 border border-zinc-800">
          <p className="text-zinc-400 text-sm">Positions</p>
          <h2 className="text-2xl font-bold mt-2">
            {totalPositions}
          </h2>
        </div>

        <div className="col-span-2 bg-zinc-900 rounded-2xl p-5 border border-zinc-800">
          <p className="text-zinc-400 text-sm">Profit / Loss</p>
          <h2
            className={`text-3xl font-bold mt-2 ${
              profit >= 0 ? "text-green-400" : "text-red-400"
            }`}
          >
            {money(profit)} ({profitPercent.toFixed(2)}%)
          </h2>
        </div>
      </div>

      <div className="bg-zinc-900 rounded-2xl p-5 border border-zinc-800 mb-6">
        <p className="text-zinc-400 text-sm mb-2">Top Holding</p>

        {topHolding ? (
          <>
            <h2 className="text-2xl font-bold">
              {topHolding.ticker}
            </h2>

            <p className="text-zinc-400 mt-1">
              {topHolding.shares.toFixed(3)} shares
            </p>

            <p className="text-green-400 font-semibold mt-2">
              {money(biggestPositionValue)}
            </p>
          </>
        ) : (
          <p className="text-zinc-500">No portfolio data yet</p>
        )}
      </div>

      <div className="bg-zinc-900 rounded-2xl p-5 border border-zinc-800">
        <p className="text-zinc-400 text-sm mb-3">Holdings</p>

        <div className="space-y-3">
          {positions.slice(0, 6).map((position, index) => {
            const value = position.shares * position.currentPrice;

            return (
              <div
                key={`${position.ticker}-${index}`}
                className="flex justify-between"
              >
                <span>{position.ticker}</span>
                <span className="text-zinc-400">
                  {money(value)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <BottomNav />
    </main>
  );
}