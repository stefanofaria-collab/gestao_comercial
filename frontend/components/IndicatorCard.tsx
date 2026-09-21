"use client";


type Props = {
  title: string;
  value: string;
  helper?: string;
  emphasize?: boolean;
};


export default function IndicatorCard({
  title,
  value,
  helper,
  emphasize = false,
}: Props) {
  return (
    <div
      className={`rounded-2xl border p-5 ${
        emphasize
          ? "border-blue-200 bg-blue-50"
          : "border-slate-200 bg-white"
      }`}
    >
      <p
        className={`text-xs font-bold uppercase tracking-wider ${
          emphasize
            ? "text-blue-700"
            : "text-slate-500"
        }`}
      >
        {title}
      </p>

      <p
        className={`mt-2 text-2xl font-black tracking-tight ${
          emphasize
            ? "text-blue-950"
            : "text-slate-950"
        }`}
      >
        {value}
      </p>

      {helper ? (
        <p className="mt-1 text-xs leading-5 text-slate-500">
          {helper}
        </p>
      ) : null}
    </div>
  );
}
