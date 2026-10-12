function despeckleLabels(labels, width, height, minSize, numColors) {
  if (minSize <= 1) return labels;
  const total = width * height;
  const visited = new Uint8Array(total);
  const queue = new Int32Array(total);
  const borderVotes = new Int32Array(numColors);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const start = y * width + x;
      if (visited[start]) continue;
      const color = labels[start];
      visited[start] = 1;
      queue[0] = start;
      let head = 0;
      let tail = 1;
      borderVotes.fill(0);
      while (head < tail) {
        const current = queue[head++];
        const cx = current % width;
        const cy = (current / width) | 0;
        if (cx > 0) {
          const neighbor = current - 1;
          const neighborColor = labels[neighbor];
          if (neighborColor === color) {
            if (!visited[neighbor]) {
              visited[neighbor] = 1;
              queue[tail++] = neighbor;
            }
          } else borderVotes[neighborColor]++;
        }
        if (cx < width - 1) {
          const neighbor = current + 1;
          const neighborColor = labels[neighbor];
          if (neighborColor === color) {
            if (!visited[neighbor]) {
              visited[neighbor] = 1;
              queue[tail++] = neighbor;
            }
          } else borderVotes[neighborColor]++;
        }
        if (cy > 0) {
          const neighbor = current - width;
          const neighborColor = labels[neighbor];
          if (neighborColor === color) {
            if (!visited[neighbor]) {
              visited[neighbor] = 1;
              queue[tail++] = neighbor;
            }
          } else borderVotes[neighborColor]++;
        }
        if (cy < height - 1) {
          const neighbor = current + width;
          const neighborColor = labels[neighbor];
          if (neighborColor === color) {
            if (!visited[neighbor]) {
              visited[neighbor] = 1;
              queue[tail++] = neighbor;
            }
          } else borderVotes[neighborColor]++;
        }
      }
      if (tail < minSize) {
        let maxVotes = -1;
        let bestColor = color;
        for (let candidate = 0; candidate < numColors; candidate++) {
          if (borderVotes[candidate] > maxVotes) {
            maxVotes = borderVotes[candidate];
            bestColor = candidate;
          }
        }
        for (let index = 0; index < tail; index++) labels[queue[index]] = bestColor;
      }
    }
  }
  return labels;
}

function recordVote(votes, touched, count, color, amount = 1) {
  if (votes[color] === 0) touched[count++] = color;
  votes[color] += amount;
  return count;
}

function smoothBoundaries(labels, width, height, passes, numColors) {
  if (passes <= 0) return labels;
  let source = labels;
  let destination = new Uint8Array(width * height);
  const votes = new Int32Array(numColors);
  const touched = new Int32Array(10);
  for (let pass = 0; pass < passes; pass++) {
    for (let y = 0; y < height; y++) {
      const row = y * width;
      const previousRow = y > 0 ? row - width : row;
      const nextRow = y < height - 1 ? row + width : row;
      for (let x = 0; x < width; x++) {
        const current = row + x;
        const selfColor = source[current];
        const previousX = x > 0 ? x - 1 : x;
        const nextX = x < width - 1 ? x + 1 : x;
        let count = 0;
        count = recordVote(votes, touched, count, source[previousRow + previousX]);
        count = recordVote(votes, touched, count, source[previousRow + x]);
        count = recordVote(votes, touched, count, source[previousRow + nextX]);
        count = recordVote(votes, touched, count, source[row + previousX]);
        count = recordVote(votes, touched, count, selfColor, 2);
        count = recordVote(votes, touched, count, source[row + nextX]);
        count = recordVote(votes, touched, count, source[nextRow + previousX]);
        count = recordVote(votes, touched, count, source[nextRow + x]);
        count = recordVote(votes, touched, count, source[nextRow + nextX]);
        let maxVotes = -1;
        let bestColor = selfColor;
        for (let index = 0; index < count; index++) {
          const color = touched[index];
          if (votes[color] > maxVotes || (votes[color] === maxVotes && color < bestColor)) {
            maxVotes = votes[color];
            bestColor = color;
          }
        }
        for (let index = 0; index < count; index++) votes[touched[index]] = 0;
        destination[current] = bestColor;
      }
    }
    const swap = source;
    source = destination;
    destination = pass + 1 < passes ? swap : destination;
  }
  return source;
}

self.onmessage = event => {
  const { id, width, height, numColors, despeckleSize, smoothLevel } = event.data;
  let labels = new Uint8Array(event.data.labels);
  labels = despeckleLabels(labels, width, height, despeckleSize, numColors);
  labels = smoothBoundaries(labels, width, height, smoothLevel, numColors);
  self.postMessage({ id, labels: labels.buffer }, [labels.buffer]);
};
