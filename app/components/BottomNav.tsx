import Link from "next/link";

export default function BottomNav() {
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-zinc-900 border-t border-zinc-800">
      <div className="flex justify-around py-4 text-sm">
        <Link href="/">Dashboard</Link>
        <Link href="/portfolio">Portfolio</Link>
        <Link href="/watchlist">Watchlist</Link>
        <Link href="/tools">Tools</Link>
      </div>
    </div>
  );
}