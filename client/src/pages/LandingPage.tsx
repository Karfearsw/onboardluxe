import { Link } from "wouter";
import { CheckCircle, DollarSign, Users, Briefcase, ChevronRight, Star, ArrowUpRight, MapPin, Bot, FileUp } from "lucide-react";
import luxeLogo from "@assets/luxe-logo.jpg";

const OceanLuxeLogo = ({ size = "md" }: { size?: "sm" | "md" | "lg" }) => {
  const imgSize = size === "sm" ? "h-7 w-7" : size === "lg" ? "h-12 w-12" : "h-9 w-9";
  const nameSize = size === "sm" ? "text-xs" : size === "lg" ? "text-lg" : "text-sm";
  const subSize = "text-[8px]";
  return (
    <div className="flex items-center gap-2.5" aria-label="Ocean Luxe Estate LLC">
      <img src={luxeLogo} alt="Ocean Luxe shell logo" className={`${imgSize} rounded-md object-cover`} />
      <div className="flex flex-col leading-none gap-0.5">
        <span className={`${nameSize} font-semibold tracking-widest text-white`} style={{ fontFamily: "'Cormorant Garamond', serif", letterSpacing: "0.12em" }}>
          OCEAN LUXE
        </span>
        <span className={`${subSize} tracking-[0.22em] uppercase`} style={{ color: "hsl(43,85%,52%)" }}>
          Estate LLC
        </span>
      </div>
    </div>
  );
};

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Nav */}
      <nav className="ol-gradient ol-gold-line px-6 py-4 flex items-center justify-between">
        <OceanLuxeLogo />
        <div className="flex items-center gap-4">
          <Link href="/admin">
            <span className="text-sm text-white/60 hover:text-white transition-colors cursor-pointer tracking-wide">Admin</span>
          </Link>
          <Link href="/register">
            <button className="text-sm font-semibold px-5 py-2 rounded-md transition-all tracking-wide" style={{ background: "hsl(43,85%,52%)", color: "#0a0a0a" }}>
              Explore Careers
            </button>
          </Link>
          <Link href="/register"><span className="text-xs text-white/50 hover:text-white transition-colors cursor-pointer">Agent onboarding</span></Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="ol-gradient text-white py-24 px-6 flex flex-col items-center text-center" style={{ borderBottom: "1px solid rgba(212,168,45,0.15)" }}>
        <div className="inline-flex items-center gap-2 border rounded-full px-4 py-1.5 text-sm mb-8" style={{ borderColor: "rgba(212,168,45,0.3)", background: "rgba(212,168,45,0.06)" }}>
          <Star className="h-3.5 w-3.5" style={{ fill: "hsl(43,85%,52%)", color: "hsl(43,85%,52%)" }} />
          <span className="text-white/80 tracking-wide">1 active agent — building to 100</span>
        </div>

        {/* Logo mark centered */}
        <img src={luxeLogo} alt="Ocean Luxe" className="h-20 w-20 rounded-xl object-cover mb-6" style={{ boxShadow: "0 0 40px rgba(212,168,45,0.3)" }} />

        <h1 className="text-4xl md:text-6xl font-semibold leading-tight max-w-3xl mb-4" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
          Become an Ocean Luxe<br />
          <span style={{ color: "hsl(43,85%,52%)" }}>Acquisitions Agent</span>
        </h1>
        <p className="text-white/60 text-lg max-w-xl mb-10 font-light tracking-wide">
          Work remotely. Close real estate wholesale deals. Earn commission. Access elite tools, training, and a team that moves.
        </p>
        <Link href="/register">
          <button
            data-testid="hero-cta"
            className="font-semibold px-10 py-3.5 rounded-md text-base transition-all flex items-center gap-2 tracking-wide"
            style={{ background: "hsl(43,85%,52%)", color: "#0a0a0a" }}
          >
            Start Onboarding Now <ChevronRight className="h-4 w-4" />
          </button>
        </Link>
        <p className="text-white/30 text-sm mt-4 tracking-wide">$50/month · Commission-based · Cancel anytime</p>
      </section>

      {/* Stats bar */}
      <section className="py-8 px-6" style={{ background: "#111", borderBottom: "1px solid rgba(212,168,45,0.12)" }}>
        <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          {[
            { label: "Target Agents", value: "100" },
            { label: "Monthly Platform Fee", value: "$50" },
            { label: "MRR Goal", value: "$5,000" },
            { label: "Markets", value: "FL · MI · RI" },
          ].map(s => (
            <div key={s.label}>
              <div className="text-2xl font-bold" style={{ color: "hsl(43,85%,52%)", fontFamily: "'Cormorant Garamond', serif" }}>{s.value}</div>
              <div className="text-xs text-white/40 mt-1 tracking-widest uppercase">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* What you get */}
      <section className="py-20 px-6 max-w-4xl mx-auto w-full">
        <h2 className="text-3xl font-semibold text-center mb-2" style={{ fontFamily: "'Cormorant Garamond', serif" }}>What's included in your $50/month</h2>
        <div className="w-12 h-px mx-auto mb-12" style={{ background: "hsl(43,85%,52%)" }} />
        <div className="grid md:grid-cols-3 gap-6">
          {[
            {
              icon: <Briefcase className="h-5 w-5" style={{ color: "hsl(43,85%,52%)" }} />,
              title: "CRM Access",
              desc: "Full pipeline management, lead tracking, and deal calculator — all in one platform.",
            },
            {
              icon: <Users className="h-5 w-5" style={{ color: "hsl(43,85%,52%)" }} />,
              title: "Team & Training",
              desc: "Cold calling scripts, objection handling, deal analysis training, and live group calls.",
            },
            {
              icon: <DollarSign className="h-5 w-5" style={{ color: "hsl(43,85%,52%)" }} />,
              title: "Commission Payouts",
              desc: "Earn per closed deal. Fast payouts via SoFi, PayPal, or direct deposit.",
            },
          ].map(c => (
            <div key={c.title} className="bg-card border border-border rounded-xl p-6 gold-hover">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-4" style={{ background: "rgba(212,168,45,0.08)", border: "1px solid rgba(212,168,45,0.15)" }}>
                {c.icon}
              </div>
              <h3 className="font-semibold mb-2 tracking-wide">{c.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{c.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Careers */}
      <section id="careers" className="py-24 px-6 bg-background">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-xs uppercase tracking-[0.28em] text-muted-foreground mb-3">Build with us</p>
            <h2 className="text-3xl md:text-4xl font-semibold" style={{ fontFamily: "'Cormorant Garamond', serif" }}>Find your next chapter at Ocean Luxe</h2>
            <div className="w-12 h-px mx-auto mt-4" style={{ background: "hsl(43,85%,52%)" }} />
            <p className="max-w-2xl mx-auto mt-5 text-muted-foreground leading-relaxed">We are building a people-first acquisitions team where ambition is supported by practical training, modern systems, and room to grow.</p>
          </div>
          <div className="grid lg:grid-cols-2 gap-5 mb-10">
            {[
              { title: "Virtual Assistant", type: "Remote · Hourly pay", text: "Support our team with research, organization, CRM updates, and day-to-day operations. Upload your resume and tell us how you work best.", icon: <Bot className="h-5 w-5" /> },
              { title: "Acquisitions Agent", type: "Remote · Commission-based", text: "Build relationships with homeowners, qualify opportunities, and help create win-win deals with a team behind you.", icon: <Briefcase className="h-5 w-5" /> },
              { title: "Senior Acquisitions Agent", type: "Remote · Leadership track", text: "Coach agents, sharpen negotiations, and own the path from qualified lead to signed agreement.", icon: <Users className="h-5 w-5" /> },
            ].map((job) => <div key={job.title} className="group bg-card border border-border rounded-2xl p-6 gold-hover transition-all hover:-translate-y-1">
              <div className="flex items-start justify-between gap-4"><div><div className="mb-3" style={{ color: "hsl(43,85%,42%)" }}>{job.icon}</div><h3 className="text-xl font-semibold" style={{ fontFamily: "'Cormorant Garamond', serif" }}>{job.title}</h3><p className="text-xs uppercase tracking-widest mt-2" style={{ color: "hsl(43,85%,42%)" }}>{job.type}</p></div><ArrowUpRight className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" /></div>
              <p className="text-sm text-muted-foreground leading-relaxed mt-5">{job.text}</p>
              <Link href={`/register?position=${encodeURIComponent(job.title)}`}><button className="mt-6 text-sm font-semibold flex items-center gap-2" style={{ color: "hsl(43,85%,42%)" }}>Apply for this role <ChevronRight className="h-4 w-4" /></button></Link>
            </div>)}
          </div>
          <div className="rounded-2xl p-7 text-white ol-gradient border" style={{ borderColor: "rgba(212,168,45,0.2)" }}>
            <div className="grid md:grid-cols-3 gap-6 items-center"><div className="md:col-span-2"><p className="text-xs uppercase tracking-[0.25em] mb-2" style={{ color: "hsl(43,85%,52%)" }}>The Ocean Luxe standard</p><h3 className="text-2xl font-semibold" style={{ fontFamily: "'Cormorant Garamond', serif" }}>Serious about the work. Generous with the support.</h3><p className="text-white/60 text-sm mt-3 leading-relaxed">Expect clear expectations, hands-on feedback, a thoughtful onboarding path, and the tools to turn consistent effort into real opportunity.</p></div><div className="space-y-3 text-sm text-white/75"><div className="flex gap-2 items-center"><MapPin className="h-4 w-4" style={{ color: "hsl(43,85%,52%)" }} /> Remote-first team</div><div className="flex gap-2 items-center"><Users className="h-4 w-4" style={{ color: "hsl(43,85%,52%)" }} /> Mentorship culture</div><div className="flex gap-2 items-center"><CheckCircle className="h-4 w-4" style={{ color: "hsl(43,85%,52%)" }} /> Learn, earn, advance</div></div></div>
          </div>
        </div>
      </section>

      {/* Onboarding steps */}
      <section className="py-20 px-6 bg-background" style={{ borderTop: "1px solid rgba(212,168,45,0.15)" }}>
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-semibold text-center mb-2" style={{ fontFamily: "'Cormorant Garamond', serif" }}>Onboarding in 6 simple steps</h2>
          <div className="w-12 h-px mx-auto mb-2" style={{ background: "hsl(43,85%,52%)" }} />
          <p className="text-center text-muted-foreground text-sm mb-10 tracking-wide">Takes less than 15 minutes to complete</p>
          <div className="space-y-3">
            {[
              { n: 1, title: "Create your profile", sub: "Name, contact info, location" },
              { n: 2, title: "Sign the ICA", sub: "Independent Contractor Agreement — digital signature" },
              { n: 3, title: "Upload your W-9", sub: "Required for contractor payouts" },
              { n: 4, title: "Verify your ID", sub: "Driver's license or government-issued ID" },
              { n: 5, title: "Set up payout", sub: "SoFi, PayPal, or bank transfer" },
              { n: 6, title: "Complete training", sub: "5 short modules — cold calling to deal closing" },
            ].map(step => (
              <div key={step.n} className="flex items-center gap-4 bg-card border border-border rounded-xl px-5 py-4 gold-hover">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0" style={{ background: "#0a0a0a", color: "hsl(43,85%,52%)" }}>
                  {step.n}
                </div>
                <div>
                  <div className="font-medium text-sm tracking-wide">{step.title}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{step.sub}</div>
                </div>
                <CheckCircle className="h-4 w-4 ml-auto" style={{ color: "rgba(0,0,0,0.1)" }} />
              </div>
            ))}
          </div>
          <div className="text-center mt-10">
            <Link href="/register">
              <button
                data-testid="bottom-cta"
                className="font-semibold px-10 py-3.5 rounded-md transition-all tracking-wide"
                style={{ background: "#0a0a0a", color: "hsl(43,85%,52%)" }}
              >
                Get Started — Join Ocean Luxe
              </button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="ol-gradient text-white/40 py-10 px-6 text-center text-sm mt-auto" style={{ borderTop: "1px solid rgba(212,168,45,0.15)" }}>
        <OceanLuxeLogo size="md" />
        <div className="mt-4">
          <p className="text-white/30 text-xs tracking-widest">© 2026 OCEAN LUXE ESTATE LLC · OCEANLUXE.ORG</p>
          <p className="text-white/20 text-xs mt-1">Commission-based. Earnings depend on deals closed. Not a guaranteed income opportunity.</p>
        </div>
      </footer>
    </div>
  );
}
