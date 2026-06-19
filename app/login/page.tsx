const loginWithGitHub = async () => {
    setLoading(true);
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    await supabase.auth.signInWithOAuth({
      provider: "github",
      options: {
        // บังคับให้วิ่งกลับมาที่หน้าหลักของ Production เสมอ ไม่ว่าจะกดจากลิงก์ไหน
        redirectTo: "https://stock-dashboard-dun-xi.vercel.app/auth/callback",
      },
    });
  };
