"use client";

type Props = {
  currency: "USD" | "THB";
  rate: number;
  lastUpdate: string;
  onToggle: () => void;
};

export default function CurrencyToggle({ currency, rate, lastUpdate, onToggle }: Props) {
  return (
    <button
      onClick={onToggle}
      className="flex flex-col items-center px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg transition-colors group"
    >
      <div className="flex items-center gap-1.5">
        <span className={`text-xs font-black transition-colors ${currency === "USD" ? "text-emerald-400" : "text-zinc-500"}`}>
          $
        </span>
        <span className="text-zinc-600 text-[10px]">/</span>
        <span className={`text-xs font-black transition-colors ${currency === "THB" ? "text-yellow-400" : "text-zinc-500"}`}>
          ฿
        </span>
      </div>
      {rate > 0 && (
        <span className="text-[9px] text-zinc-600 group-hover:text-zinc-500 leading-none mt-0.5 whitespace-nowrap">
          1$={rate}฿
        </span>
      )}
    </button>
  );
}
