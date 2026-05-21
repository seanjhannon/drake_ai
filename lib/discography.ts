export const ALBUM_COLORS: Record<string, string> = {
  "Thank Me Later": "#7B6040",
  "Take Care": "#3A7B50",
  "Nothing Was the Same": "#6A4A8B",
  "If You're Reading This It's Too Late": "#2A6A8B",
  "Views": "#4A7A3A",
  "More Life": "#8B5A35",
  "Scorpion": "#8B8030",
  "Certified Lover Boy": "#8B3068",
  "Honestly Nevermind": "#306A8B",
  "Her Loss": "#8B3030",
  "For All The Dogs": "#502A8B",
};

export interface AlbumEntry {
  album: string;
  year: number;
  songs: string[];
}

export const DRAKE_DISCOGRAPHY: AlbumEntry[] = [
  { album: "Thank Me Later", year: 2010, songs: ["Fireworks", "Karaoke", "The Resistance", "Find Your Love", "Show Me a Good Time", "Up All Night", "Fancy", "Shut It Down", "Unforgettable", "Light Up", "Miss Me"] },
  { album: "Take Care", year: 2011, songs: ["Over My Dead Body", "Shot for Me", "Headlines", "Crew Love", "Take Care", "Marvins Room", "Under Ground Kings", "Make Me Proud", "Lord Knows", "Cameras", "Doing It Wrong", "Look What You've Done", "Practice", "The Ride", "Moment 4 Life", "Trust Issues", "The Motto"] },
  { album: "Nothing Was the Same", year: 2013, songs: ["Tuscan Leather", "Furthest Thing", "Started from the Bottom", "Wu-Tang Forever", "Own It", "Worst Behavior", "From Time", "Hold On We're Going Home", "Connect", "The Language", "Too Much", "Pound Cake", "Come Thru", "All Me"] },
  { album: "If You're Reading This It's Too Late", year: 2015, songs: ["Legend", "Energy", "10 Bands", "Know Yourself", "No Tellin", "Madonna", "No Good", "Used To", "6 God", "Star67", "Preach", "6 Man", "Now & Forever", "Company", "You & The 6", "Jungle"] },
  { album: "Views", year: 2016, songs: ["Keep the Family Close", "9", "U With Me", "Feel No Ways", "Hype", "Weston Road Flows", "Redemption", "Faithful", "Controlla", "One Dance", "Child's Play", "Pop Style", "Too Good", "Fire & Desire", "Views", "Hotline Bling"] },
  { album: "More Life", year: 2017, songs: ["Free Smoke", "Passionfruit", "Get It Together", "Madiba Riddim", "Blem", "Gyalchester", "Portland", "Sacrifices", "Nothings Into Somethings", "Teenage Fever", "KMT", "Lose You", "Glow", "Fake Love", "Do Not Disturb"] },
  { album: "Scorpion", year: 2018, songs: ["Survival", "Nonstop", "Emotionless", "God's Plan", "I'm Upset", "8 Out of 10", "Talk Up", "Peak", "Summer Games", "Jaded", "Nice for What", "Finesse", "In My Feelings", "Don't Matter to Me", "March 14", "Mob Ties", "Sandra's Rose"] },
  { album: "Certified Lover Boy", year: 2021, songs: ["Champagne Poetry", "TSU", "Way 2 Sexy", "Race My Mind", "Fountains", "Knife Talk", "The Remorse", "Papi's Home", "Girls Want Girls", "Love All", "No Friends in the Industry", "IMY2", "Pipe Down", "In the Bible"] },
  { album: "Honestly Nevermind", year: 2022, songs: ["Falling Back", "Currents", "A Keeper", "Calling My Name", "Sticky", "Massive", "Flight's Booked", "Overdued", "Down Hill", "Tie That Binds", "Liability"] },
  { album: "Her Loss", year: 2022, songs: ["Rich Flex", "Major Distribution", "On BS", "BackOutsideBoyz", "Broke Boys", "Privileged Rappers", "Jimmy Cooks", "Middle of the Ocean", "P Power", "More M's", "Hours in Silence", "Just Like Rap"] },
  { album: "For All The Dogs", year: 2023, songs: ["Virginia Beach", "Amen", "Calling for You", "Fear of Heights", "First Person Shooter", "7969 Santa", "Daylight", "Bahamas Promises", "Polar Opposite", "How Bout Now", "All The Parties", "Members Only", "IDGAF", "8AM in Charlotte", "Rich Baby Daddy", "Another Late Night", "Drew a Picasso", "Red Button"] },
];

export const TOTAL_SONGS = DRAKE_DISCOGRAPHY.reduce((sum, a) => sum + a.songs.length, 0);
