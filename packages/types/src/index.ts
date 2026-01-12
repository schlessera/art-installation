/**
 * @art/types
 *
 * Shared TypeScript interfaces for the Art Installation.
 */

// Actor types
export type {
  Actor,
  ActorMetadata,
  ActorAuthor,
  ActorSetupAPI,
  ActorUpdateAPI,
  ActorModule,
  FrameContext,
  RegisteredActor,
  ActorUsageStats,
  ContextType,
} from './actor';

// Canvas types
export type {
  RGBA,
  Rectangle,
  Point,
  ColorHistogram,
  CanvasSize,
  CanvasReadAPI,
  CanvasSnapshot,
  CanvasSnapshotOptions,
} from './canvas';

// Brush types
export type {
  Color,
  BlendMode,
  LineCap,
  LineJoin,
  Gradient,
  GradientStop,
  Pattern,
  Fill,
  ShapeStyle,
  LineStyle,
  StrokeStyle,
  TextStyle,
  ImageOptions,
  PathBuilder,
  BrushAPI,
} from './brush';

// Filter types
export type {
  FilterType,
  FilterDefinition,
  ColorMatrix,
  FilterAPI,
} from './filter';
export { COLOR_MATRICES } from './filter';

// Context types
export type {
  TimeContext,
  Season,
  WeatherContext,
  WeatherCondition,
  AudioContext,
  AudioLevels,
  VideoContext,
  MotionData,
  FaceData,
  SocialContext,
  SocialMention,
  ContextAPI,
  ContextSnapshot,
} from './context';

// Artwork types
export type {
  ActorContribution,
  ArtworkReview,
  ArtworkVote,
  SavedArtwork,
  GalleryStats,
  ArtworkQueryFilters,
  PruningResult,
} from './artwork';
export { calculateCombinedScore, shouldPrune } from './artwork';
