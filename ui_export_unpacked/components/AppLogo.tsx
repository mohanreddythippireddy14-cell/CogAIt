import { useState } from "react";

const LOGO_SRC = "/branding/cogalt-logo.png";

export function AppLogo({
  size = "md",
  showTagline = false,
}: {
  size?: "sm" | "md" | "lg";
  showTagline?: boolean;
}) {
  const [failed, setFailed] = useState(false);

  const dimensions =
    size === "sm" ? "h-8" : size === "lg" ? "h-20 md:h-24" : "h-12 md:h-14";

  if (failed) {
    return (
      <div>
        <h1 className="text-3xl md:text-4xl font-bold mb-2 bg-gradient-to-r from-[#4820dc] via-[#7c3aed] to-[#dc2878] bg-clip-text text-transparent drop-shadow-[0_0_20px_rgba(72,32,220,0.4)]">
          CogAIt
        </h1>
        {showTagline && (
          <p className="text-base text-muted font-medium tracking-wide">
            Think-First AI Learning Platform
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="inline-flex flex-col items-center">
      <img
        src={LOGO_SRC}
        alt="CogAIt logo"
        className={`${dimensions} w-auto object-contain drop-shadow-[0_0_15px_rgba(72,32,220,0.3)]`}
        onError={() => setFailed(true)}
      />
      {showTagline && (
        <p className="text-base text-muted mt-2 font-medium tracking-wide">
          Think-First AI Learning Platform
        </p>
      )}
    </div>
  );
}
