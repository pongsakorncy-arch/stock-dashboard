import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-black text-white p-6">
      <h1 className="text-3xl font-bold mb-3">Stock Dashboard</h1>

      <p className="text-zinc-400 mb-6">
        Portfolio app is running.
      </p>

      <Link
        href="/portfolio"
        className="block w-full bg-blue-600 text-center p-4 rounded font-bold"
      >
        Open Portfolio
      </Link>
    </main>
  );
}