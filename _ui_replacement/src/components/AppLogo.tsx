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
        <h1 className="text-3xl md:text-4xl font-bold mb-2 text-primary">
          CogAIt
        </h1>
        {showTagline && (
          <p className="text-base text-muted-foreground font-medium tracking-wide">
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
        className={`${dimensions} w-auto object-contain`}
        onError={() => setFailed(true)}
      />
      {showTagline && (
        <p className="text-base text-muted-foreground mt-2 font-medium tracking-wide">
          Think-First AI Learning Platform
        </p>
      )}
    </div>
  );
}
