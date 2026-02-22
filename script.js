// --- 1. SETUP DIMENSIONS ---
const margin = { top: 50, right: 100, bottom: 50, left: 80 };
const width = 1000 - margin.left - margin.right;
const height = 600 - margin.top - margin.bottom;

const svg = d3.select("#chart-container")
    .append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

let currentMode = "max"; 

// --- 2. LOAD & PROCESS DATA ---
d3.csv("temperature_daily.csv").then(rawData => {
    const parseDate = d3.timeParse("%Y-%m-%d");

    let data = rawData.map(d => {
        const dateObj = parseDate(d.date);
        return {
            date: dateObj,
            year: dateObj.getFullYear(),
            month: dateObj.getMonth() + 1, 
            day: dateObj.getDate(),
            max_temp: +d.max_temperature, 
            min_temp: +d.min_temperature
        };
    });

    const maxYear = d3.max(data, d => d.year);
    data = data.filter(d => d.year > maxYear - 10);

    const monthlyData = [];
    const grouped = d3.group(data, d => d.year, d => d.month);
    
    grouped.forEach((months, year) => {
        months.forEach((days, month) => {
            days.sort((a, b) => d3.ascending(a.day, b.day));
            monthlyData.push({
                year: year,
                month: month,
                maxTemp: d3.max(days, d => d.max_temp),
                minTemp: d3.min(days, d => d.min_temp),
                daily: days 
            });
        });
    });

    // --- 3. SCALES ---
    const years = Array.from(new Set(monthlyData.map(d => d.year))).sort();
    const months = d3.range(1, 13);

    const xScale = d3.scaleBand().domain(years).range([0, width]).padding(0.05);
    const yScale = d3.scaleBand().domain(months).range([0, height]).padding(0.05);

    const cellWidth = xScale.bandwidth();
    const cellHeight = yScale.bandwidth();

    const maxTempExtent = d3.extent(monthlyData, d => d.maxTemp);
    const minTempExtent = d3.extent(monthlyData, d => d.minTemp);

    const colorScaleMax = d3.scaleSequential(d3.interpolateYlOrRd).domain([maxTempExtent[0], maxTempExtent[1]]);
    // Flipped domain for darker blues on colder temps!
    const colorScaleMin = d3.scaleSequential(d3.interpolateBlues).domain([minTempExtent[1], minTempExtent[0]]);

    const miniX = d3.scaleLinear().domain([1, 31]).range([2, cellWidth - 2]);
    const miniY = d3.scaleLinear()
        .domain([d3.min(data, d => d.min_temp), d3.max(data, d => d.max_temp)])
        .range([cellHeight - 2, 2]);

    const lineGeneratorMax = d3.line()
        .defined(d => d.max_temp != null && !isNaN(d.max_temp))
        .x(d => miniX(d.day))
        .y(d => miniY(d.max_temp)); 
        
    const lineGeneratorMin = d3.line()
        .defined(d => d.min_temp != null && !isNaN(d.min_temp))
        .x(d => miniX(d.day))
        .y(d => miniY(d.min_temp)); 

    // --- 4. DRAW AXES ---
    svg.append("g").call(d3.axisTop(xScale).tickFormat(d3.format("d")));
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    svg.append("g").call(d3.axisLeft(yScale).tickFormat(d => monthNames[d - 1]));

    // --- 5. DRAW MATRIX CELLS ---
    const tooltip = d3.select("#tooltip");

    const cells = svg.selectAll(".cell-group")
        .data(monthlyData)
        .enter()
        .append("g")
        .attr("class", "cell-group")
        .attr("transform", d => `translate(${xScale(d.year)}, ${yScale(d.month)})`)
        .on("mouseover", (event, d) => {
            tooltip.style("opacity", 1);
            const val = currentMode === "max" ? d.maxTemp : d.minTemp;
            tooltip.html(`
                <strong>${monthNames[d.month-1]} ${d.year}</strong><br/>
                ${currentMode.toUpperCase()} Temp: ${val.toFixed(1)}°C
            `);
        })
        .on("mousemove", event => {
            tooltip.style("left", (event.pageX + 15) + "px")
                   .style("top", (event.pageY - 20) + "px");
        })
        .on("mouseout", () => tooltip.style("opacity", 0))
        .on("click", toggleMode);

    const rects = cells.append("rect")
        .attr("width", cellWidth)
        .attr("height", cellHeight)
        .attr("rx", 3)
        .attr("fill", d => colorScaleMax(d.maxTemp));

    cells.append("path")
        .attr("class", "sparkline")
        .datum(d => d.daily)
        .attr("d", lineGeneratorMax)
        .style("stroke", "red");

    cells.append("path")
        .attr("class", "sparkline")
        .datum(d => d.daily)
        .attr("d", lineGeneratorMin)
        .style("stroke", "blue");

    // --- 6. LEGEND ---
    const legendGrp = svg.append("g").attr("transform", `translate(${width + 20}, 20)`);
    
    function drawLegend() {
        legendGrp.selectAll("*").remove(); 
        
        const scale = currentMode === "max" ? colorScaleMax : colorScaleMin;
        const domain = scale.domain();
        
        legendGrp.append("text")
            .attr("y", -10)
            .text(currentMode === "max" ? "Max °C" : "Min °C")
            .style("font-weight", "bold");

        const highest = Math.max(domain[0], domain[1]);
        const lowest = Math.min(domain[0], domain[1]);

        const steps = 10;
        const stepHeight = 20;
        const stepSize = (highest - lowest) / steps;
        
        const legendData = d3.range(highest, lowest - (stepSize / 2), -stepSize);

        legendGrp.selectAll("rect")
            .data(legendData)
            .enter().append("rect")
            .attr("y", (d, i) => i * stepHeight)
            .attr("width", 20)
            .attr("height", stepHeight)
            .attr("fill", d => scale(d)); 

        legendGrp.selectAll("text.label")
            .data(legendData)
            .enter().append("text")
            .attr("class", "label")
            .attr("x", 25)
            .attr("y", (d, i) => i * stepHeight + 15)
            .text(d => Math.round(d));
    }
    drawLegend();

    // --- 7. INTERACTION / TOGGLE ---
    function toggleMode() {
        currentMode = currentMode === "max" ? "min" : "max";
        d3.select("#toggle-btn").text(`Showing: ${currentMode.toUpperCase()} Temperature`);

        rects.transition().duration(500)
            .attr("fill", d => currentMode === "max" ? colorScaleMax(d.maxTemp) : colorScaleMin(d.minTemp));
        
        drawLegend();
    }

    d3.select("#toggle-btn").on("click", toggleMode);

}).catch(err => {
    console.error("Error loading data:", err);
});