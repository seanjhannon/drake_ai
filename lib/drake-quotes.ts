/** Iconic Drake one-liners — shown at random on each page load. */
export const DRAKE_QUOTES = [
  "Started from the bottom, now we're here.",
  "Know yourself, know your worth.",
  "Running through the 6 with my woes.",
  "Tables turn, bridges burn.",
  "Last name ever, first name greatest.",
  "I only love my bed and my mama, I'm sorry.",
  "God's plan, God's plan.",
  "Fake love, fake friends, fake interactions.",
  "Zero to a hundred real quick.",
  "Turn the 6 upside down, it's a 9 now.",
  "No new friends, no, no new.",
  "Jealousy is just love and hate at the same time.",
  "Sometimes I need a reminder of who I always been.",
  "Energy go up and down like a see-saw.",
  "I could teach you how to love, but nah.",
  "Miss me with that bullshit.",
  "Who's calling my phone at 4 AM?",
  "All I care about is money and the city that I'm from.",
  "I'm livin' life right now, man, and this what I'ma do till it's over.",
  "Niggas still playing my old shit.",
  "Worst behavior, mothafuckas never loved us.",
  "I got enemies, got a lot of enemies.",
  "Hotline bling, that can only mean one thing.",
  "Passionate from miles away, passive with the things I say.",
  "I got bitches, too. And I only got time for a few.",
  "Praying and hoping, but no I'm not.",
  "The game is all mine and I'm on my grind.",
  "Nothing was the same.",
  "Certified lover boy, certified pedophile — wait, wrong app.",
  "More life, more everything.",
] as const;

export function randomDrakeQuote(): string {
  return DRAKE_QUOTES[Math.floor(Math.random() * DRAKE_QUOTES.length)];
}
