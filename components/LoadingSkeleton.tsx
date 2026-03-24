'use client';

export function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-6 p-4 h-full animate-pulse">
      {/* Connection status skeleton */}
      <div className="absolute top-4 right-4 flex items-center gap-2">
        <div className="h-9 w-32 bg-gray-700/50 rounded-full" />
        <div className="w-3 h-3 rounded-full bg-gray-600" />
      </div>

      {/* Audio visualizer skeleton */}
      <div className="relative h-40 w-full flex items-center justify-center">
        <div className="w-full max-w-2xl">
          <div className="flex items-end justify-center gap-1 h-32">
            {[...Array(40)].map((_, i) => (
              <div
                key={i}
                className="w-1 bg-gray-700/50 rounded-full"
                style={{
                  height: `${Math.random() * 60 + 20}%`,
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Status text skeleton */}
      <div className="text-center h-4">
        <div className="h-4 w-32 bg-gray-700/50 rounded mx-auto" />
      </div>

      {/* Mic button skeleton */}
      <div className="fixed bottom-14 md:bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-3">
        <div className="w-16 h-16 bg-gray-700/50 rounded-full" />
        <div className="w-10 h-10 bg-gray-700/50 rounded-full" />
      </div>

      {/* Chat panel skeleton */}
      <div className="fixed bottom-32 right-4 w-80 bg-gray-800/90 backdrop-blur-sm rounded-lg shadow-xl border border-gray-700 p-4">
        <div className="space-y-3">
          <div className="h-4 w-3/4 bg-gray-700/50 rounded" />
          <div className="h-4 w-1/2 bg-gray-700/50 rounded" />
          <div className="h-4 w-5/6 bg-gray-700/50 rounded" />
        </div>
      </div>
    </div>
  );
}
