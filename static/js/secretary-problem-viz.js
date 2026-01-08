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
        this.simulationCount = 0;
    }

    generateCandidates() {
        // Generate random candidate scores
        this.candidates = [];
        for (let i = 0; i < this.numCandidates; i++) {
            this.candidates.push({
                index: i,
                score: Math.random(),
                explored: false,
                selected: false,
                status: 'not_seen' // 'explored', 'selected', 'not_seen'
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
            this.candidates[i].explored = true;
            this.candidates[i].status = 'explored';
            if (this.candidates[i].score > this.threshold) {
                this.threshold = this.candidates[i].score;
            }
        }

        // Phase 2: Select first candidate better than threshold
        this.selectedIndex = -1;
        for (let i = this.lookSeeCount; i < this.numCandidates; i++) {
            this.candidates[i].status = 'not_seen';
            if (this.candidates[i].score > this.threshold) {
                this.selectedIndex = i;
                this.candidates[i].selected = true;
                this.candidates[i].status = 'selected';
                break;
            }
        }

        // If no one beat threshold, select last candidate
        if (this.selectedIndex === -1) {
            this.selectedIndex = this.numCandidates - 1;
            this.candidates[this.selectedIndex].selected = true;
            this.candidates[this.selectedIndex].status = 'selected';
        }

        // Mark remaining candidates as explored if we passed them
        for (let i = this.selectedIndex + 1; i < this.numCandidates; i++) {
            this.candidates[i].status = 'not_seen';
        }
        
        // Calculate rank of selected candidate (1 = best, numCandidates = worst)
        const sortedScores = [...this.candidates].sort((a, b) => b.score - a.score);
        const selectedScore = this.candidates[this.selectedIndex].score;
        const rank = sortedScores.findIndex(c => c.score === selectedScore) + 1;
        
        return rank;
    }

    runMultipleSimulations(count = 100) {
        this.results = [];
        for (let i = 0; i < count; i++) {
            this.generateCandidates();
            const rank = this.runAlgorithm();
            this.results.push({
                simulation: i + 1,
                rank: rank,
                isOptimal: rank === 1,
                selectedIndex: this.selectedIndex,
                bestIndex: this.bestIndex
            });
        }
        this.render();
    }

    reset() {
        this.results = [];
        this.simulationCount = 0;
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
        const successRate = this.results.length > 0 ? 
            (this.results.filter(r => r.isOptimal).length / this.results.length * 100).toFixed(1) : 0;
        const avgRank = this.results.length > 0 ? 
            (this.results.reduce((sum, r) => sum + r.rank, 0) / this.results.length).toFixed(2) : null;
        
        let html = `
            <div class="secretary-viz-container">
                <div class="viz-stats mb-6 p-4 bg-gray-50 rounded-lg">
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-center mb-4">
                        <div>
                            <div class="text-sm text-gray-600">Total Candidates</div>
                            <div class="text-2xl font-bold text-gray-900">${this.numCandidates}</div>
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
                    ${this.results.length > 0 ? `
                    <div class="grid grid-cols-2 md:grid-cols-3 gap-4 text-center pt-4 border-t border-gray-300">
                        <div>
                            <div class="text-sm text-gray-600">Simulations Run</div>
                            <div class="text-2xl font-bold text-gray-900">${this.results.length}</div>
                        </div>
                        <div>
                            <div class="text-sm text-gray-600">Success Rate</div>
                            <div class="text-2xl font-bold text-green-600">${successRate}%</div>
                        </div>
                        <div>
                            <div class="text-sm text-gray-600">Average Rank</div>
                            <div class="text-2xl font-bold text-purple-600">${avgRank}</div>
                        </div>
                    </div>
                    ` : ''}
                </div>

                <div class="candidates-visualization mb-4">
                    <div class="phase-labels mb-2 flex text-sm font-semibold">
                        <div style="width: ${(this.lookSeeCount / this.numCandidates * 100)}%;" class="text-center text-blue-600 border-r-2 border-gray-300">Explore Phase</div>
                        <div style="width: ${((this.selectedIndex + 1 - this.lookSeeCount) / this.numCandidates * 100)}%;" class="text-center text-orange-600 border-r-2 border-gray-300">Select Phase</div>
                        <div style="width: ${((this.numCandidates - this.selectedIndex - 1) / this.numCandidates * 100)}%;" class="text-center text-gray-500">Not Seen</div>
                    </div>
                    
                    <div class="candidates-grid" style="grid-template-columns: repeat(${this.numCandidates}, 1fr);">
        `;

        this.candidates.forEach((candidate, idx) => {
            let phase = idx < this.lookSeeCount ? 'explore' : 
                       idx <= this.selectedIndex ? 'select' : 'not-seen';
            
            let height = Math.max(40, candidate.score * 150); // Scale to 40-190px
            let bgColor = 'bg-gray-300';
            let borderColor = 'border-gray-400';
            let textColor = 'text-gray-700';
            let label = '';
            
            if (idx === this.bestIndex) {
                borderColor = 'border-2 border-yellow-400';
                label = '<div class="absolute -top-6 text-xs font-bold text-yellow-600">★ Best</div>';
            }
            
            if (candidate.status === 'explored') {
                bgColor = 'bg-blue-200';
                borderColor = 'border-blue-400';
            } else if (candidate.status === 'selected') {
                bgColor = isOptimal ? 'bg-green-400' : 'bg-orange-400';
                borderColor = isOptimal ? 'border-green-600' : 'border-orange-600';
                borderColor += ' border-2';
                textColor = 'text-white font-bold';
                label += '<div class="absolute -bottom-6 text-xs font-bold">SELECTED</div>';
            }
            
            // Show score only for selected and best candidates, or use a smaller display
            const showScore = idx === this.selectedIndex || idx === this.bestIndex || idx < this.lookSeeCount;
            
            html += `
                <div class="candidate-card relative flex flex-col items-center">
                    ${label}
                    <div class="candidate-bar ${bgColor} ${borderColor} rounded-t ${textColor} w-full flex items-center justify-center text-xs font-semibold transition-all"
                         style="height: ${height}px; min-height: 20px;"
                         title="Candidate ${idx + 1}: Score ${candidate.score.toFixed(3)}">
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
                            Total Simulations: <span class="text-purple-600 text-lg">${this.results.length}</span>
                        </div>
                    </div>
                    <div class="graph-container" style="height: 300px; position: relative;">
                        <canvas id="rank-chart" width="800" height="300"></canvas>
                    </div>
                </div>
                ` : ''}
                
                <div class="button-container mt-6 flex flex-wrap gap-3 justify-center">
                    <button id="run-single" class="px-6 py-2 bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-700 transition-colors">
                        Run Single Simulation
                    </button>
                    <button id="run-many" class="px-6 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors">
                        Run 100 Simulations
                    </button>
                    <button id="reset" class="px-6 py-2 bg-gray-600 text-white rounded-lg font-semibold hover:bg-gray-700 transition-colors">
                        Reset
                    </button>
                </div>
            </div>
        `;

        this.container.innerHTML = html;
        
        // Add event listeners
        const runSingleBtn = document.getElementById('run-single');
        const runManyBtn = document.getElementById('run-many');
        const resetBtn = document.getElementById('reset');
        
        if (runSingleBtn) {
            runSingleBtn.onclick = () => {
                this.generateCandidates();
                const rank = this.runAlgorithm();
                this.results.push({
                    simulation: this.results.length + 1,
                    rank: rank,
                    isOptimal: rank === 1,
                    selectedIndex: this.selectedIndex,
                    bestIndex: this.bestIndex
                });
                this.render();
            };
        }
        
        if (runManyBtn) {
            runManyBtn.onclick = () => {
                this.runMultipleSimulations(100);
            };
        }
        
        if (resetBtn) {
            resetBtn.onclick = () => {
                this.reset();
            };
        }
        
        // Render chart if we have results
        if (this.results.length > 0) {
            this.renderChart();
        }
    }
    
    renderChart() {
        const canvas = document.getElementById('rank-chart');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        
        // Clear canvas
        ctx.clearRect(0, 0, width, height);
        
        // Calculate rank distribution
        const rankCounts = {};
        this.results.forEach(r => {
            rankCounts[r.rank] = (rankCounts[r.rank] || 0) + 1;
        });
        
        const maxRank = Math.max(...this.results.map(r => r.rank));
        const maxCount = Math.max(...Object.values(rankCounts));
        
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

    simulate() {
        this.generateCandidates();
        this.runAlgorithm();
        this.render();
    }
}

// Initialize visualization when page loads
document.addEventListener('DOMContentLoaded', function() {
    const vizContainer = document.getElementById('secretary-problem-viz');
    if (vizContainer) {
        window.secretaryViz = new SecretaryProblemViz('secretary-problem-viz', 50);
        // Run first simulation automatically on page load
        window.secretaryViz.generateCandidates();
        const rank = window.secretaryViz.runAlgorithm();
        window.secretaryViz.results.push({
            simulation: 1,
            rank: rank,
            isOptimal: rank === 1,
            selectedIndex: window.secretaryViz.selectedIndex,
            bestIndex: window.secretaryViz.bestIndex
        });
        window.secretaryViz.render();
    }
});

