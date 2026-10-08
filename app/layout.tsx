import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { Big_Shoulders, Geist, Geist_Mono } from "next/font/google";
import { siteConfig } from "@/site.config";
import "./globals.css";

// --- TIPOGRAFIA: trocar as fontes aqui muda o site inteiro ----------------
const display = Big_Shoulders({ variable: "--f-display", subsets: ["latin"], weight: ["700", "800", "900"] });
const body = Geist({ variable: "--f-body", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--f-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: `${siteConfig.nickname} · ${siteConfig.eyebrow}`,
  description: "My swim, bike and run training in numbers, straight from Strava.",
};

// Aplica o tema salvo (ou o do sistema) antes da primeira pintura: sem flash.
const themeScript = `(function(){try{var t=localStorage.getItem('theme');if(!t){t=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'}document.documentElement.dataset.theme=t;if(sessionStorage.getItem('splash')){document.documentElement.dataset.splash='off'}else{sessionStorage.setItem('splash','1')}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const sportVars = {
    "--run": siteConfig.sports.run.color,
    "--ride": siteConfig.sports.ride.color,
    "--swim": siteConfig.sports.swim.color,
    "--strength": siteConfig.sports.strength.color,
    "--other": siteConfig.sports.other.color,
    "--brand": siteConfig.brand,
    "--goal": siteConfig.goalColor,
  } as CSSProperties;

  return (
    <html
      lang={siteConfig.defaultLang}
      data-theme="dark"
      style={sportVars}
      suppressHydrationWarning
      className={`${display.variable} ${body.variable} ${mono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full flex flex-col">
        {children}
      </body>
    </html>
  );
}
