export function readAutonomyLevel(title: string): "L1" | "L2" | "L3" | "L4" {
  const t = title.toLowerCase();
  // Simulated parsing of strictly mapped SOUL categories
  if (
    t.includes("internal") ||
    t.includes("equipo") ||
    t.includes("medical") ||
    t.includes("médico") ||
    t.includes("salud")
  ) {
    return "L3";
  }
  if (
    t.includes("finance") ||
    t.includes("banco") ||
    t.includes("legal") ||
    t.includes("financiero")
  ) {
    return "L1";
  }
  return "L2"; // Default baseline
}
