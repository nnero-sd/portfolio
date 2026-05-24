import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import scrollama from 'https://cdn.jsdelivr.net/npm/scrollama@3.2.0/+esm';

async function loadData() {
  const data = await d3.csv('loc.csv', (row) => ({
    ...row,
    line: Number(row.line),
    depth: Number(row.depth),
    length: Number(row.length),
    date: new Date(row.date + 'T00:00' + row.timezone),
    datetime: new Date(row.datetime),
  }));
  return data;
}

function processCommits(data) {
  return d3
    .groups(data, (d) => d.commit)
    .map(([commit, lines]) => {
      let first = lines[0];
      let { author, date, time, timezone, datetime } = first;
      let ret = {
        id: commit,
        url: 'https://github.com/nnero-sd/portfolio/commit/' + commit,
        author,
        date,
        time,
        timezone,
        datetime,
        hourFrac: datetime.getHours() + datetime.getMinutes() / 60,
        totalLines: lines.length,
      };
      Object.defineProperty(ret, 'lines', {
        value: lines,
        enumerable: false,
        writable: true,
        configurable: true,
      });
      return ret;
    })
    .sort((a, b) => a.datetime - b.datetime);
}

function renderCommitInfo(data, commits) {
  const dl = d3.select('#stats').append('dl').attr('class', 'stats');
  dl.append('dt').text('Commits');
  dl.append('dd').text(commits.length);
  dl.append('dt').text('Files');
  dl.append('dd').text(d3.group(data, d => d.file).size);
  dl.append('dt').html('Total <abbr title="Lines of Code">LOC</abbr>');
  dl.append('dd').text(data.length);
  dl.append('dt').text('Max depth');
  dl.append('dd').text(d3.max(data, d => d.depth));
  dl.append('dt').text('Longest line');
  dl.append('dd').text(d3.max(data, d => d.length));
  dl.append('dt').text('Max lines');
  dl.append('dd').text(d3.max(commits, d => d.totalLines));
}

function renderTooltipContent(commit) {
  const link = document.getElementById('commit-link');
  const date = document.getElementById('commit-date');
  if (Object.keys(commit).length === 0) return;
  link.href = commit.url;
  link.textContent = commit.id;
  date.textContent = commit.datetime.toLocaleString('en', { dateStyle: 'full' });
  document.getElementById('commit-time').textContent = commit.time;
  document.getElementById('commit-author').textContent = commit.author;
  document.getElementById('commit-lines').textContent = commit.totalLines;
}

function updateTooltipVisibility(isVisible) {
  const tooltip = document.getElementById('commit-tooltip');
  tooltip.hidden = !isVisible;
}

function updateTooltipPosition(event) {
  const tooltip = document.getElementById('commit-tooltip');
  tooltip.style.left = `${event.clientX}px`;
  tooltip.style.top = `${event.clientY}px`;
}

// Module-level so brush helper functions can access them
let xScale, yScale;

function isCommitSelected(selection, commit) {
  if (!selection) return false;
  const [[x0, y0], [x1, y1]] = selection;
  const x = xScale(commit.datetime);
  const y = yScale(commit.hourFrac);
  return x >= x0 && x <= x1 && y >= y0 && y <= y1;
}

function renderSelectionCount(selection) {
  const selectedCommits = selection
    ? commits.filter((d) => isCommitSelected(selection, d))
    : [];
  const countElement = document.querySelector('#selection-count');
  countElement.textContent = `${selectedCommits.length || 'No'} commits selected`;
  return selectedCommits;
}

function renderLanguageBreakdown(selection) {
  const selectedCommits = selection
    ? commits.filter((d) => isCommitSelected(selection, d))
    : [];
  const container = document.getElementById('language-breakdown');

  if (selectedCommits.length === 0) {
    container.innerHTML = '';
    return;
  }

  const lines = selectedCommits.flatMap((d) => d.lines);
  const breakdown = d3.rollup(
    lines,
    (v) => v.length,
    (d) => d.type,
  );

  container.innerHTML = '';
  for (const [language, count] of breakdown) {
    const proportion = count / lines.length;
    const formatted = d3.format('.1~%')(proportion);
    container.innerHTML += `
      <dt>${language}</dt>
      <dd>${count} lines (${formatted})</dd>
    `;
  }
}

function brushed(event) {
  const selection = event.selection;
  d3.selectAll('circle').classed('selected', (d) =>
    isCommitSelected(selection, d),
  );
  renderSelectionCount(selection);
  renderLanguageBreakdown(selection);
}

const colorScale = d3.scaleOrdinal(d3.schemeTableau10);

function updateFileDisplay(filteredCommits) {
  const lines = filteredCommits.flatMap((d) => d.lines);
  const files = d3
    .groups(lines, (d) => d.file)
    .map(([name, lines]) => ({ name, lines }))
    .sort((a, b) => b.lines.length - a.lines.length);

  const filesContainer = d3.select('#files');

  const fileItems = filesContainer
    .selectAll('div')
    .data(files, (d) => d.name)
    .join(
      (enter) => enter.append('div').call((div) => {
        div.append('dt');
        div.append('dd');
      }),
      (update) => update,
      (exit) => exit.remove(),
    );

  fileItems.select('dt').text((d) => d.name);

  fileItems.select('dd').selectAll('.loc')
    .data((d) => d.lines)
    .join('div')
    .attr('class', 'loc')
    .style('--color', (d) => colorScale(d.type));
}

function renderScatterPlot(data, commits) {
  const width = 1000;
  const height = 600;
  const margin = { top: 10, right: 10, bottom: 30, left: 20 };

  const usableArea = {
    top: margin.top,
    right: width - margin.right,
    bottom: height - margin.bottom,
    left: margin.left,
    width: width - margin.left - margin.right,
    height: height - margin.top - margin.bottom,
  };

  const svg = d3
    .select('#chart')
    .append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .style('overflow', 'visible');

  xScale = d3
    .scaleTime()
    .domain(d3.extent(commits, (d) => d.datetime))
    .range([usableArea.left, usableArea.right])
    .nice();

  yScale = d3
    .scaleLinear()
    .domain([0, 24])
    .range([usableArea.bottom, usableArea.top]);

  svg.call(d3.brush().on('start brush end', brushed));

  const gridlines = svg
    .append('g')
    .attr('class', 'gridlines')
    .attr('transform', `translate(${usableArea.left}, 0)`);

  gridlines.call(
    d3.axisLeft(yScale).tickSize(-usableArea.width).tickFormat(''),
  );

  const [minLines, maxLines] = d3.extent(commits, (d) => d.totalLines);
  const rScale = d3.scaleSqrt().domain([minLines, maxLines]).range([2, 30]);

  const sortedCommits = d3.sort(commits, (d) => -d.totalLines);

  const dots = svg.append('g').attr('class', 'dots');

  dots
    .selectAll('circle')
    .data(sortedCommits, (d) => d.id)
    .join('circle')
    .attr('cx', (d) => xScale(d.datetime))
    .attr('cy', (d) => yScale(d.hourFrac))
    .attr('r', (d) => rScale(d.totalLines))
    .attr('fill', (d) => {
      const dayness = 1 - Math.abs(d.hourFrac - 12) / 12;
      return d3.interpolateRdYlBu(1 - dayness);
    })
    .style('fill-opacity', 0.7)
    .on('mouseenter', (event, commit) => {
      d3.select(event.currentTarget).style('fill-opacity', 1);
      renderTooltipContent(commit);
      updateTooltipVisibility(true);
      updateTooltipPosition(event);
    })
    .on('mouseleave', (event) => {
      d3.select(event.currentTarget).style('fill-opacity', 0.7);
      updateTooltipVisibility(false);
    });

  svg.selectAll('.dots, .overlay ~ *').raise();

  svg
    .append('g')
    .attr('class', 'x-axis')
    .attr('transform', `translate(0, ${usableArea.bottom})`)
    .call(d3.axisBottom(xScale));

  svg
    .append('g')
    .attr('class', 'y-axis')
    .attr('transform', `translate(${usableArea.left}, 0)`)
    .call(
      d3.axisLeft(yScale).tickFormat((d) => String(d % 24).padStart(2, '0') + ':00'),
    );
}

function updateScatterPlot(data, filteredCommits) {
  const svg = d3.select('#chart svg');
  const width = 1000;
  const margin = { top: 10, right: 10, bottom: 30, left: 20 };
  const usableArea = {
    left: margin.left,
    right: width - margin.right,
    bottom: 600 - margin.bottom,
    top: margin.top,
    width: width - margin.left - margin.right,
  };

  xScale = d3
    .scaleTime()
    .domain(d3.extent(filteredCommits, (d) => d.datetime))
    .range([usableArea.left, usableArea.right])
    .nice();

  svg.select('.x-axis').call(d3.axisBottom(xScale));

  const [minLines, maxLines] = d3.extent(filteredCommits, (d) => d.totalLines);
  const rScale = d3.scaleSqrt().domain([minLines || 0, maxLines || 1]).range([2, 30]);

  const sortedCommits = d3.sort(filteredCommits, (d) => -d.totalLines);

  svg
    .select('.dots')
    .selectAll('circle')
    .data(sortedCommits, (d) => d.id)
    .join(
      (enter) =>
        enter
          .append('circle')
          .attr('cx', (d) => xScale(d.datetime))
          .attr('cy', (d) => yScale(d.hourFrac))
          .attr('r', 0)
          .attr('fill', (d) => {
            const dayness = 1 - Math.abs(d.hourFrac - 12) / 12;
            return d3.interpolateRdYlBu(1 - dayness);
          })
          .style('fill-opacity', 0.7)
          .on('mouseenter', (event, commit) => {
            d3.select(event.currentTarget).style('fill-opacity', 1);
            renderTooltipContent(commit);
            updateTooltipVisibility(true);
            updateTooltipPosition(event);
          })
          .on('mouseleave', (event) => {
            d3.select(event.currentTarget).style('fill-opacity', 0.7);
            updateTooltipVisibility(false);
          })
          .call((enter) =>
            enter.transition().duration(300).attr('r', (d) => rScale(d.totalLines)),
          ),
      (update) =>
        update.call((update) =>
          update
            .transition()
            .duration(300)
            .attr('cx', (d) => xScale(d.datetime))
            .attr('cy', (d) => yScale(d.hourFrac))
            .attr('r', (d) => rScale(d.totalLines)),
        ),
      (exit) => exit.transition().duration(300).attr('r', 0).remove(),
    );
}

function generateStorySteps(commits) {
  const storyContainer = d3.select('#scatter-story');

  storyContainer
    .selectAll('.step')
    .data(commits)
    .join('div')
    .attr('class', 'step')
    .html(
      (d, i) => `
      <p>
        On <strong>${d.datetime.toLocaleString('en', { dateStyle: 'full', timeStyle: 'short' })}</strong>,
        ${i === 0 ? 'I made the first commit' : 'I committed'}
        ${d.totalLines} lines to
        <a href="${d.url}" target="_blank">${d.id.slice(0, 7)}</a>.
      </p>
    `,
    );
}

let data = await loadData();
let commits = processCommits(data);

renderCommitInfo(data, commits);
renderScatterPlot(data, commits);
updateFileDisplay(commits);
generateStorySteps(commits);

// Scrollytelling setup
const scroller = scrollama();

scroller
  .setup({
    step: '#scatter-story .step',
    offset: 0.5,
  })
  .onStepEnter((response) => {
    const commit = commits[response.index];
    const filteredCommits = commits.filter((d) => d.datetime <= commit.datetime);
    updateScatterPlot(data, filteredCommits);
    updateFileDisplay(filteredCommits);
  });
