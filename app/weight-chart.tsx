import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export default function WeightChart({ weightData, chartMin, chartMax }: { weightData: { date: string; value: number }[]; chartMin: number; chartMax: number }) {
  return <ResponsiveContainer width="100%" height="100%"><AreaChart data={weightData}><defs><linearGradient id="weightFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ff5b17" stopOpacity={0.25} /><stop offset="100%" stopColor="#ff5b17" stopOpacity={0} /></linearGradient></defs><CartesianGrid vertical={false} stroke="#ece5dc" /><XAxis dataKey="date" axisLine={false} tickLine={false} /><YAxis domain={[chartMin, chartMax]} axisLine={false} tickLine={false} width={32} /><Tooltip /><Area type="monotone" dataKey="value" stroke="#ff5b17" strokeWidth={3} fill="url(#weightFill)" dot={{ r: 4, fill: "#fff", stroke: "#ff5b17", strokeWidth: 2 }} /></AreaChart></ResponsiveContainer>;
}
