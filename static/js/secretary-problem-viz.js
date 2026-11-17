// Secretary Problem Visualization
class SecretaryProblemViz {
    constructor(containerId, numCandidates = 50) {
        this.container = document.getElementById(containerId);
        this.numCandidates = numCandidates;
        this.candidates = [];
        this.selectedIndex = -1;
        this.bestIndex = -1;
        this.lookSeeCount = 0;
        this.threshold = 0;
        this.results = []; // Store results from multiple simulations
        // The one large run in progress, or null. Only reset() and the run
        // itself clear it, so there is never more than one chain of batches.
        this.activeRun = null;
    }

    generateCandidates() {
        // Generate random candidate scores
        this.candidates = [];
        for (let i = 0; i < this.numCandidates; i++) {
            this.candidates.push({
                index: i,
                score: Math.random(),
                // 'explored': interviewed in the look-see phase
                // 'passed_over': interviewed in the select phase, not hired
                // 'selected': hired
                // 'not_seen': never interviewed
                status: 'not_seen'
            });
        }
        
        // Find the best candidate
        this.bestIndex = this.candidates.reduce((maxIdx, candidate, idx, arr) => 
            candidate.score > arr[maxIdx].score ? idx : maxIdx, 0);
        
        // Calculate look-see phase (37% rule)
        this.lookSeeCount = Math.max(1, Math.floor(this.numCandidates * 0.37));
        this.threshold = 0;
    }

    runAlgorithm() {
        // Phase 1: Look-see (explore first 37%)
        for (let i = 0; i < this.lookSeeCount; i++) {
            this.candidates[i].status = 'explored';
            if (this.candidates[i].score > this.threshold) {
                this.threshold = this.candidates[i].score;
            }
        }

        // Phase 2: Select first candidate better than threshold
        this.selectedIndex = -1;
        for (let i = this.lookSeeCount; i < this.numCandidates; i++) {
            if (this.candidates[i].score > this.threshold) {
                this.selectedIndex = i;
                this.candidates[i].status = 'selected';
                break;
            }
            // Interviewed, but not better than the threshold
            this.candidates[i].status = 'passed_over';
        }

        // If no one beat threshold, select last candidate
        if (this.selectedIndex === -1) {
            this.selectedIndex = this.numCandidates - 1;
            this.candidates[this.selectedIndex].status = 'selected';
        }

        // Candidates after the selected one were never interviewed
        for (let i = this.selectedIndex + 1; i < this.numCandidates; i++) {
            this.candidates[i].status = 'not_seen';
        }
        
        // Calculate rank of selected candidate (1 = best, numCandidates = worst)
        const sortedScores = [...this.candidates].sort((a, b) => b.score - a.score);
        const selectedScore = this.candidates[this.selectedIndex].score;
        const rank = sortedScores.findIndex(c => c.score === selectedScore) + 1;
        
        return rank;
    }

    // Run one simulation and add it to the results
    recordSimulation() {
        this.generateCandidates();
        const rank = this.runAlgorithm();
        this.results.push({
            simulation: this.results.length + 1,
            rank: rank,
            isOptimal: rank === 1,
            selectedIndex: this.selectedIndex,
            bestIndex: this.bestIndex
        });
    }

    isRunning() {
        return this.activeRun !== null;
    }

    runSingleSimulation() {
        if (this.isRunning()) {
            return;
        }
        this.recordSimulation();
        this.render();
    }

    runMultipleSimulations(count = 100) {
        // Add simulations to existing results (additive). One run at a time:
        // a press while a run is going is ignored.
        if (this.isRunning()) {
            return;
        }

        // For large counts, run in batches to prevent UI freezing
        const batchSize = 1000;

        if (count <= batchSize) {
            // Small count, run synchronously
            for (let i = 0; i < count; i++) {
                this.recordSimulation();
            }
            this.render();
            return;
        }

        const run = { remaining: count, timer: null };
        this.activeRun = run;
        this.setRunButtonsDisabled(true);

        const runBatch = () => {
            run.timer = null;
            if (this.activeRun !== run) {
                // reset() ended this run
                return;
            }

            const batchCount = Math.min(batchSize, run.remaining);
            for (let i = 0; i < batchCount; i++) {
                this.recordSimulation();
            }
            run.remaining -= batchCount;

            if (run.remaining > 0) {
                // Update stats after each batch for visual feedback,
                // without a full re-render, then schedule the next batch
                this.updateStatsOnly();
                run.timer = setTimeout(runBatch, 0);
            } else {
                // All batches complete, do full render
                this.activeRun = null;
                this.render();
            }
        };

        // Start first batch
        runBatch();
    }

    // End the large run in progress, if there is one
    cancelRun() {
        const run = this.activeRun;
        if (run === null) {
            return;
        }
        if (run.timer !== null) {
            clearTimeout(run.timer);
        }
        this.activeRun = null;
    }

    setRunButtonsDisabled(disabled) {
        this.container.querySelectorAll('button[data-run]').forEach(button => {
            button.disabled = disabled;
        });
    }

    // Count and rank percentages, formatted for display
    resultStats() {
        const total = this.results.length;
        const percent = rank => total === 0 ? '0.0' :
            (this.results.filter(r => r.rank === rank).length / total * 100).toFixed(1);
        return {
            total: total.toLocaleString(),
            rank1Percent: percent(1),
            rank2Percent: percent(2),
            rank3Percent: percent(3)
        };
    }

    setStat(name, text) {
        const el = this.container.querySelector(`[data-stat="${name}"]`);
        if (el) {
            el.textContent = text;
        }
    }

    updateStatsOnly() {
        // Update only the stats display without full re-render
        const stats = this.resultStats();
        this.setStat('simulations-run', stats.total);
        this.setStat('rank-1-percent', stats.rank1Percent + '%');
        this.setStat('rank-2-percent', stats.rank2Percent + '%');
        this.setStat('rank-3-percent', stats.rank3Percent + '%');
        // Total simulations in the chart header, when the chart is shown
        this.setStat('total-simulations', stats.total);
    }

    reset() {
        // End a run in progress first, so no later batch adds to the cleared results
        this.cancelRun();
        this.results = [];
        this.render();
    }

    render() {
        const currentRank = this.candidates.length > 0 ? 
            (() => {
                const sortedScores = [...this.candidates].sort((a, b) => b.score - a.score);
                const selectedScore = this.candidates[this.selectedIndex].score;
                return sortedScores.findIndex(c => c.score === selectedScore) + 1;
            })() : null;
        
        const isOptimal = this.selectedIndex === this.bestIndex;
        
        const stats = this.resultStats();
        // Run buttons are off while a large run is going
        const runDisabled = this.isRunning() ? 'disabled' : '';
        
        let html = `
            <div class="secretary-viz-container">
                <div class="button-container mb-6 flex flex-wrap gap-3 justify-center">
                    <button id="run-single" data-run ${runDisabled} class="px-6 py-2 bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                        Run Single Simulation
                    </button>
                    <button id="run-100" data-run ${runDisabled} class="px-6 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                        +100 Simulations
                    </button>
                    <button id="run-1000" data-run ${runDisabled} class="px-6 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                        +1,000 Simulations
                    </button>
                    <button id="run-10000" data-run ${runDisabled} class="px-6 py-2 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                        +10,000 Simulations
                    </button>
                    <button id="run-100000" data-run ${runDisabled} class="px-6 py-2 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                        +100,000 Simulations
                    </button>
                    <button id="reset" class="px-6 py-2 bg-gray-600 text-white rounded-lg font-semibold hover:bg-gray-700 transition-colors">
                        Reset
                    </button>
                </div>
                
                <div class="viz-stats mb-6 p-4 bg-gray-50 rounded-lg">
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-center mb-4">
                        <div>
                            <div class="text-sm text-gray-600">Total Candidates</div>
                            <div class="text-2xl font-bold text-gray-900" data-stat="total-candidates">${this.numCandidates}</div>
                        </div>
                        <div>
                            <div class="text-sm text-gray-600">Look-See Phase</div>
                            <div class="text-2xl font-bold text-blue-600">${this.lookSeeCount}</div>
                        </div>
                        <div>
                            <div class="text-sm text-gray-600">Threshold</div>
                            <div class="text-2xl font-bold text-purple-600">${this.threshold.toFixed(3)}</div>
                        </div>
                        <div>
                            <div class="text-sm text-gray-600">Result</div>
                            <div class="text-2xl font-bold ${isOptimal ? 'text-green-600' : 'text-orange-600'}">
                                ${currentRank ? `Rank #${currentRank}` : 'Run simulation'}
                            </div>
                        </div>
                    </div>
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-center pt-4 border-t border-gray-300">
                        <div>
                            <div class="text-sm text-gray-600">Simulations Run</div>
                            <div class="text-2xl font-bold text-gray-900" data-stat="simulations-run">${stats.total}</div>
                        </div>
                        <div>
                            <div class="text-sm text-gray-600">Rank 1 %</div>
                            <div class="text-2xl font-bold text-green-600" data-stat="rank-1-percent">${stats.rank1Percent}%</div>
                        </div>
                        <div>
                            <div class="text-sm text-gray-600">Rank 2 %</div>
                            <div class="text-2xl font-bold text-blue-600" data-stat="rank-2-percent">${stats.rank2Percent}%</div>
                        </div>
                        <div>
                            <div class="text-sm text-gray-600">Rank 3 %</div>
                            <div class="text-2xl font-bold text-purple-600" data-stat="rank-3-percent">${stats.rank3Percent}%</div>
                        </div>
                    </div>
                </div>

                <div class="candidates-visualization mb-4">
                    <h3 class="text-xl font-bold mb-4 text-gray-900">Latest Simulation</h3>
                    <div class="phase-labels mb-2 flex text-sm font-semibold">
                        <div style="width: ${(this.lookSeeCount / this.numCandidates * 100)}%;" class="text-center text-blue-600 border-r-2 border-gray-300">Explore Phase</div>
                        <div style="width: ${((this.selectedIndex + 1 - this.lookSeeCount) / this.numCandidates * 100)}%;" class="text-center text-orange-600 border-r-2 border-gray-300">Select Phase</div>
                        <div style="width: ${((this.numCandidates - this.selectedIndex - 1) / this.numCandidates * 100)}%;" class="text-center text-gray-500">Not Seen</div>
                    </div>
                    
                    <div class="candidates-grid" style="grid-template-columns: repeat(${this.numCandidates}, 1fr);">
        `;

        this.candidates.forEach((candidate, idx) => {
            let height = Math.max(40, candidate.score * 150); // Scale to 40-190px
            let bgColor = 'bg-gray-300';
            let borderColor = 'border-gray-400';
            let textColor = 'text-gray-700';
            let label = '';
            let statusText = 'not seen';
            
            if (idx === this.bestIndex) {
                borderColor = 'border-2 border-yellow-400';
                label = '<div class="absolute -top-6 text-xs font-bold text-yellow-600">★ Best</div>';
            }
            
            if (candidate.status === 'explored') {
                bgColor = 'bg-blue-200';
                borderColor = 'border-blue-400';
                statusText = 'interviewed in the explore phase';
            } else if (candidate.status === 'passed_over') {
                // Interviewed in the select phase: drawn in that phase's colour
                bgColor = 'bg-orange-200';
                borderColor = 'border-orange-400';
                statusText = 'interviewed and passed over';
            } else if (candidate.status === 'selected') {
                bgColor = isOptimal ? 'bg-green-400' : 'bg-orange-400';
                borderColor = isOptimal ? 'border-green-600' : 'border-orange-600';
                borderColor += ' border-2';
                textColor = 'text-white font-bold';
                label += '<div class="absolute -bottom-6 text-xs font-bold">SELECTED</div>';
                statusText = 'selected';
            }
            
            // Show the score of every candidate who was interviewed, and of the best one
            const showScore = candidate.status !== 'not_seen' || idx === this.bestIndex;
            
            html += `
                <div class="candidate-card relative flex flex-col items-center" data-status="${candidate.status}">
                    ${label}
                    <div class="candidate-bar ${bgColor} ${borderColor} rounded-t ${textColor} w-full flex items-center justify-center text-xs font-semibold transition-all"
                         style="height: ${height}px; min-height: 20px;"
                         title="Candidate ${idx + 1}: Score ${candidate.score.toFixed(3)} (${statusText})">
                        ${showScore ? (candidate.score * 100).toFixed(0) : ''}
                    </div>
                    ${idx === this.selectedIndex || idx === this.bestIndex || idx < 3 || idx >= this.numCandidates - 3 ? 
                      `<div class="mt-1 text-xs text-gray-600">#${idx + 1}</div>` : ''}
                </div>
            `;
        });

        html += `
                    </div>
                </div>

                ${this.candidates.length > 0 ? `
                <div class="viz-explanation mt-6 p-4 bg-purple-50 rounded-lg">
                    <h4 class="font-bold mb-2">Algorithm Steps:</h4>
                    <ol class="list-decimal list-inside space-y-1 text-sm text-gray-700">
                        <li><strong>Explore Phase:</strong> Interviewed candidates 1-${this.lookSeeCount} to establish a threshold of ${this.threshold.toFixed(3)}</li>
                        <li><strong>Select Phase:</strong> Selected candidate #${this.selectedIndex + 1} (score: ${this.candidates[this.selectedIndex].score.toFixed(3)}) as the first candidate better than the threshold</li>
                        <li><strong>Result:</strong> ${isOptimal ? 
                            '✓ Successfully found the optimal candidate (Rank #1)!' : 
                            `Selected candidate ranked #${currentRank} (Best candidate was #${this.bestIndex + 1} with score ${this.candidates[this.bestIndex].score.toFixed(3)})`}</li>
                    </ol>
                </div>
                ` : ''}
                
                ${this.results.length > 0 ? `
                <div class="results-graph mt-6 p-4 bg-white rounded-lg border border-gray-200">
                    <div class="flex items-center justify-between mb-4">
                        <h4 class="font-bold text-lg">Rank Distribution</h4>
                        <div class="text-sm text-gray-600 font-semibold">
                            Total Simulations: <span class="text-purple-600 text-lg" data-stat="total-simulations">${stats.total}</span>
                        </div>
                    </div>
                    <div class="graph-container" style="height: 300px; position: relative;">
                        <canvas id="rank-chart" width="800" height="300"></canvas>
                    </div>
                </div>
                ` : ''}
            </div>
        `;

        this.container.innerHTML = html;
        
        // Add event listeners
        const runSingleBtn = document.getElementById('run-single');
        const run100Btn = document.getElementById('run-100');
        const run1000Btn = document.getElementById('run-1000');
        const run10000Btn = document.getElementById('run-10000');
        const run100000Btn = document.getElementById('run-100000');
        const resetBtn = document.getElementById('reset');
        
        if (runSingleBtn) {
            runSingleBtn.onclick = () => {
                this.runSingleSimulation();
            };
        }
        
        if (run100Btn) {
            run100Btn.onclick = () => {
                this.runMultipleSimulations(100);
            };
        }
        
        if (run1000Btn) {
            run1000Btn.onclick = () => {
                this.runMultipleSimulations(1000);
            };
        }
        
        if (run10000Btn) {
            run10000Btn.onclick = () => {
                this.runMultipleSimulations(10000);
            };
        }
        
        if (run100000Btn) {
            run100000Btn.onclick = () => {
                this.runMultipleSimulations(100000);
            };
        }
        
        if (resetBtn) {
            resetBtn.onclick = () => {
                this.reset();
            };
        }
        
        // Render chart if we have results - ensure DOM is ready
        if (this.results.length > 0) {
            // Use setTimeout to ensure DOM is fully updated
            setTimeout(() => {
                this.renderChart();
            }, 10);
        }
    }
    
    renderChart() {
        const canvas = document.getElementById('rank-chart');
        if (!canvas) {
            // Retry once after a short delay if canvas not found yet
            setTimeout(() => {
                const retryCanvas = document.getElementById('rank-chart');
                if (retryCanvas) {
                    this.renderChart();
                }
            }, 50);
            return;
        }
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            console.error('Could not get 2d context');
            return;
        }
        
        // Ensure canvas has proper dimensions
        // Note: Setting width/height properties resets the canvas, so we set them once
        if (!canvas.width || !canvas.height) {
            canvas.width = 800;
            canvas.height = 300;
        }
        
        const width = canvas.width;
        const height = canvas.height;
        
        // Clear canvas
        ctx.clearRect(0, 0, width, height);
        
        if (this.results.length === 0) {
            return;
        }
        
        // Calculate rank distribution
        const rankCounts = {};
        this.results.forEach(r => {
            rankCounts[r.rank] = (rankCounts[r.rank] || 0) + 1;
        });
        
        // Spread the handful of distinct ranks, not every result: spreading
        // a few hundred thousand arguments overflows the call stack
        const maxRank = Math.max(...Object.keys(rankCounts).map(Number));
        const maxCount = Math.max(...Object.values(rankCounts));
        
        if (maxRank <= 0 || maxCount <= 0) {
            console.error('Invalid chart data:', { maxRank, maxCount });
            return;
        }
        
        // Draw axes
        ctx.strokeStyle = '#6b7280';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(50, height - 40);
        ctx.lineTo(width - 30, height - 40);
        ctx.moveTo(50, 20);
        ctx.lineTo(50, height - 40);
        ctx.stroke();
        
        // Draw labels
        ctx.fillStyle = '#374151';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        
        // X-axis labels (ranks)
        const barWidth = (width - 80) / maxRank;
        for (let rank = 1; rank <= Math.min(maxRank, 20); rank++) {
            const x = 50 + (rank - 0.5) * barWidth;
            ctx.fillText(rank.toString(), x, height - 20);
        }
        if (maxRank > 20) {
            ctx.fillText('...', 50 + (20.5) * barWidth, height - 20);
            ctx.fillText(maxRank.toString(), 50 + (maxRank - 0.5) * barWidth, height - 20);
        }
        
        // Y-axis labels
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        for (let i = 0; i <= 5; i++) {
            const value = (maxCount / 5) * i;
            const y = height - 40 - (value / maxCount) * (height - 60);
            ctx.fillText(Math.round(value).toString(), 45, y);
        }
        
        // Draw bars
        const barColors = {
            1: '#10b981', // Green for rank 1 (optimal)
            default: '#6366f1' // Purple for others
        };
        
        for (let rank = 1; rank <= maxRank; rank++) {
            const count = rankCounts[rank] || 0;
            const barHeight = (count / maxCount) * (height - 60);
            const x = 50 + (rank - 1) * barWidth;
            const y = height - 40 - barHeight;
            
            ctx.fillStyle = barColors[rank] || barColors.default;
            ctx.fillRect(x + 2, y, barWidth - 4, barHeight);
            
            // Draw count on top of bar if visible
            if (barHeight > 15 && count > 0) {
                ctx.fillStyle = '#111827';
                ctx.font = '10px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(count.toString(), x + barWidth / 2, y - 5);
            }
        }
        
        // Draw labels for axes
        ctx.fillStyle = '#374151';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Candidate Rank (1 = Best)', width / 2, height - 5);
        
        ctx.save();
        ctx.translate(15, height / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText('Frequency', 0, 0);
        ctx.restore();
    }

}

// Initialize visualization when page loads
document.addEventListener('DOMContentLoaded', function() {
    const vizContainer = document.getElementById('secretary-problem-viz');
    if (vizContainer) {
        window.secretaryViz = new SecretaryProblemViz('secretary-problem-viz', 50);
        // Run first simulation automatically on page load
        window.secretaryViz.runSingleSimulation();
    }
});


