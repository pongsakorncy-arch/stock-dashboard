"use client";

import { useEffect, useState } from "react";

type Currency = "USD" | "THB";

export function useCurrency() {
  const [currency, setCurrency] = useState<Currency>("USD");
  const [rate, setRate] = useState<number>(0); // 1 USD = ? THB
  const [lastUpdate, setLastUpdate] = useState<string>("");

  useEffect(() => {
    const saved = localStorage.getItem("tyo_currency") as Currency;
    if (saved) setCurrency(saved);

    const fetchRate = async () => {
      try {
        const res = await fetch("https://api.exchangerate-api.com/v4/latest/USD");
        const data = await res.json();
        const thb = data?.rates?.THB;
        if (thb) {
          setRate(Math.round(thb * 100) / 100);
          setLastUpdate(new Date().toLocaleTimeString("th-TH", {
            hour: "2-digit", minute: "2-digit"
          }));
        }
      } catch {
        // fallback rate
        setRate(33.50);
      }
    };

    fetchRate();
    // refresh ทุก 5 นาที
    const id = setInterval(fetchRate, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const toggleCurrency = () => {
    const next: Currency = currency === "USD" ? "THB" : "USD";
    setCurrency(next);
    localStorage.setItem("tyo_currency", next);
  };

  const convert = (usdValue: number): number => {
    if (currency === "USD") return usdValue;
    return Math.round(usdValue * rate * 100) / 100;
  };

  const format = (usdValue: number): string => {
    const val = convert(usdValue);
    if (currency === "THB") {
      return val.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " ฿";
    }
    return "$" + val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  return { currency, rate, lastUpdate, toggleCurrency, convert, format };
}
