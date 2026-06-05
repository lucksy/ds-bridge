// T1.7 — terminal renderer primitives barrel.
export {
	type BarChartItem,
	type BarChartOptions,
	renderBarChart,
} from "./bar-chart.js";
export {
	type ColorOptions,
	type Severity,
	severityColor,
	shouldColor,
} from "./severity.js";
export { sparkline } from "./sparkline.js";
export { renderTable } from "./table.js";
