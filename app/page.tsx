"use client";

import dynamic from "next/dynamic";

const AzimuthalMap = dynamic(() => import("../components/AzimuthalMap"), {
  ssr: false,
});

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center p-4">
      <AzimuthalMap />
    </div>
  );
}
