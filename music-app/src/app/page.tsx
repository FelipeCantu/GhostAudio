import CDImporter from "@/components/CDImporter";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 dark:bg-black p-4 relative overflow-hidden">
      {/* Abstract Background Elements */}
      <div className="absolute top-0 left-0 w-full h-[50vh] bg-gradient-to-b from-blue-500/10 to-transparent pointer-events-none" />
      <div className="absolute -top-20 -right-20 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-40 -left-20 w-72 h-72 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

      <main className="z-10 w-full max-w-2xl flex flex-col items-center gap-10">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-extrabold tracking-tight text-zinc-900 dark:text-white sm:text-5xl">
            Ghost<span className="text-blue-600">Audio</span>
          </h1>
          <p className="text-lg text-zinc-600 dark:text-zinc-400">
            Your personal high-fidelity music manager
          </p>
        </div>

        <CDImporter />
      </main>
    </div>
  );
}
