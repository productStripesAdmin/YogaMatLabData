import { Doc, Id } from "../../convex/_generated/dataModel";

export type YogaMat = Doc<"yogaMats">;
export type YogaMatId = Id<"yogaMats">;

export type Brand = Doc<"brands">;
export type BrandId = Id<"brands">;

export interface YogaMatAffiliateLinks {
  amazon?: string;
  rei?: string;
  brandWebsite?: string;
}

export type YogaStyle =
  | "Hatha"
  | "Vinyasa"
  | "Ashtanga"
  | "Hot Yoga"
  | "Bikram"
  | "Yin"
  | "Restorative"
  | "Power Yoga"
  | "Iyengar"
  | "Kundalini";

export type YogaMatUseCase = "Travel" | "Studio" | "Home" | "Outdoor";

export type YogaMatFeature =
  | "Eco-Friendly"
  | "Reversible"
  | "Extra Thick"
  | "Non-Slip"
  | "Lightweight"
  | "Extra Long"
  | "Extra Wide"
  | "Alignment Marks"
  | "Antimicrobial"
  | "Premium"
  | "Closed-Cell";

export type MaterialType =
  | "PVC"
  | "TPE"
  | "Natural Rubber"
  | "Cork"
  | "Jute"
  | "Cotton"
  | "PU Leather"
  | "NBR";

export type TextureType = "Smooth" | "Textured" | "Grippy" | "Suede-like";

// Quiz Types
export type QuizResult = Doc<"quizResults">;
export type QuizResultId = Id<"quizResults">;

export type ExperienceLevel = "beginner" | "intermediate" | "advanced";
export type PracticeFrequency = "daily" | "weekly" | "occasional";
export type BudgetRange = "any" | "under-50" | "50-100" | "100-150" | "150-plus";
export type ThicknessPreference = "any" | "thin" | "standard" | "thick";
export type PortabilityImportance = "not-important" | "somewhat" | "very-important";

export type PriorityFeature =
  | "grip"
  | "cushioning"
  | "eco-friendly"
  | "durability"
  | "portability"
  | "thickness"
  | "value";

export interface QuizAnswers {
  experienceLevel: ExperienceLevel;
  yogaStyles: YogaStyle[];
  practiceFrequency: PracticeFrequency;
  priorityFeatures: PriorityFeature[];
  budget: BudgetRange;
  thickness: ThicknessPreference;
  portability: PortabilityImportance;
  isTall?: boolean | null; // true = yes, false = no, null = prefer not to say
  additionalContext?: string; // Open-ended text for user to provide additional preferences
  email: string;
}

export interface MatRecommendation {
  mat: YogaMat;
  score: number;
  explanation?: string;
}

// Filter types for mat listing page
export interface MatFilters {
  brandIds?: BrandId[];
  priceRange?: { min: number; max: number };
  thicknessRange?: { min: number; max: number };
  materials?: MaterialType[];
  yogaStyles?: YogaStyle[];
  features?: YogaMatFeature[];
  minOverallScore?: number;
}

export interface MatSortOptions {
  sortBy: "price" | "overallScore" | "valueScore" | "reviewDate" | "popularity";
  sortOrder: "asc" | "desc";
}
