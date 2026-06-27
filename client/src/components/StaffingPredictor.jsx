import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';

export default function StaffingPredictor() {
  const [activeTab, setActiveTab] = useState('forecast');
  const [loading, setLoading] = useState(false);

  // Forecast state
  const [forecast, setForecast] = useState([]);
  const [alerts, setAlerts] = useState([]);

  // Optimize state
  const [optimizeLoading, setOptimizeLoading] = useState(false);
  const [dateRangeStart, setDateRangeStart] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [dateRangeEnd, setDateRangeEnd] = useState(
    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [minPerShift, setMinPerShift] = useState(3);
  const [optimizeResults, setOptimizeResults] = useState(null);

  // Patterns state
  const [patterns, setPatterns] = useState(null);

  // Scenario state
  const [scenarioInput, setScenarioInput] = useState('');
  const [scenarioLoading, setScenarioLoading] = useState(false);
  const [scenarioResults, setScenarioResults] = useState(null);
  const scenarioExamples = [
    '3 members on leave next week',
    'Add a second engine company',
    'Holiday weekend staffing',
    'Major storm event'
  ];

  // Burnout state
  const [burnoutData, setBurnoutData] = useState(null);

  // Load forecast on mount
  useEffect(() => {
    if (activeTab === 'forecast') {
      loadForecast();
    }
  }, [activeTab === 'forecast']);

  const loadForecast = async () => {
    setLoading(true);
    try {
      const response = await api.get('/staffing-ai/forecast');
      const data = response?.data || response || {};
      setForecast(Array.isArray(data?.forecast) ? data.forecast : []);
      setAlerts(Array.isArray(data?.alerts) ? data.alerts : []);
    } catch (error) {
      console.error('Error loading forecast:', error);
      setAlerts([{ message: 'Failed to load forecast', severity: 'error' }]);
    } finally {
      setLoading(false);
    }
  };

  const handleOptimize = async () => {
    setOptimizeLoading(true);
    try {
      const response = await api.post('/staffing-ai/optimize', {
        dateRange: { start: dateRangeStart, end: dateRangeEnd },
        constraints: { minPerShift }
      });
      const data = response?.data || response || {};
      setOptimizeResults({
        recommendations: Array.isArray(data?.recommendations) ? data.recommendations : [],
        coverageScore: data?.coverageScore || 0,
        riskAreas: Array.isArray(data?.riskAreas) ? data.riskAreas : []
      });
    } catch (error) {
      console.error('Error optimizing staffing:', error);
    } finally {
      setOptimizeLoading(false);
    }
  };

  const loadPatterns = async () => {
    setLoading(true);
    try {
      const response = await api.get('/staffing-ai/patterns');
      const data = response?.data || response || {};
      setPatterns(data);
    } catch (error) {
      console.error('Error loading patterns:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleModelScenario = async () => {
    if (!scenarioInput.trim()) return;
    setScenarioLoading(true);
    try {
      const response = await api.post('/staffing-ai/scenario', {
        scenario: scenarioInput
      });
      const data = response?.data || response || {};
      setScenarioResults({
        analysis: data?.analysis || '',
        impact: data?.impact || {},
        recommendations: Array.isArray(data?.recommendations) ? data.recommendations : []
      });
    } catch (error) {
      console.error('Error modeling scenario:', error);
    } finally {
      setScenarioLoading(false);
    }
  };

  const loadBurnout = async () => {
    setLoading(true);
    try {
      const response = await api.get('/staffing-ai/burnout');
      const data = response?.data || response || {};
      setBurnoutData({
        atRisk: Array.isArray(data?.atRisk) ? data.atRisk : [],
        healthy: Array.isArray(data?.healthy) ? data.healthy : [],
        stats: data?.stats || {}
      });
    } catch (error) {
      console.error('Error loading burnout data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'patterns') loadPatterns();
  }, [activeTab === 'patterns']);

  useEffect(() => {
    if (activeTab === 'burnout') loadBurnout();
  }, [activeTab === 'burnout']);

  const tabStyle = {
    padding: '1.5rem'
  };

  const cardStyle = {
    borderRadius: '1rem',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    padding: '1rem',
    marginBottom: '1rem'
  };

  const getStatusColor = (status) => {
    if (status === 'Covered') return '#22c55e';
    if (status === 'Tight') return '#eab308';
    if (status === 'Gap') return '#ef4444';
    return '#3b82f6';
  };

  const getRiskColor = (riskLevel) => {
    if (riskLevel === 'Critical') return '#ef4444';
    if (riskLevel === 'High') return '#eab308';
    return '#22c55e';
  };

  return (
    <div className="bg-gray-50 dark:bg-gray-950" style={{ minHeight: '100vh', padding: '2rem' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        <h1 className="text-gray-900 dark:text-gray-100" style={{ marginBottom: '2rem', fontSize: '2rem', fontWeight: 'bold' }}>
          AI Staffing Predictor
        </h1>

        {/* Tab Navigation */}
        <div
          className="border-b-2 border-gray-200 dark:border-gray-700"
          style={{
            display: 'flex',
            gap: '1rem',
            marginBottom: '2rem',
            flexWrap: 'wrap'
          }}
        >
          {['forecast', 'optimize', 'patterns', 'scenario', 'burnout'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={activeTab === tab ? 'bg-blue-500 text-white' : 'bg-transparent text-gray-500 dark:text-gray-400'}
              style={{
                padding: '0.75rem 1.5rem',
                border: 'none',
                cursor: 'pointer',
                fontSize: '1rem',
                fontWeight: activeTab === tab ? 'bold' : 'normal',
                borderBottom: activeTab === tab ? '3px solid #3b82f6' : 'none'
              }}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* TAB 1: 7-Day Forecast */}
        {activeTab === 'forecast' && (
          <div style={tabStyle}>
            {alerts.length > 0 && (
              <div style={{ marginBottom: '1.5rem' }}>
                {alerts.map((alert, idx) => (
                  <div
                    key={idx}
                    className={alert.severity === 'critical' ? 'bg-red-100 dark:bg-red-950/50 text-red-800 dark:text-red-300' : 'bg-amber-100 dark:bg-amber-950/50 text-amber-900 dark:text-amber-300'}
                    style={{
                      padding: '1rem',
                      borderRadius: '0.5rem',
                      marginBottom: '0.5rem'
                    }}
                  >
                    {alert.message}
                  </div>
                ))}
              </div>
            )}

            {loading ? (
              <p className="text-gray-500 dark:text-gray-400">Loading forecast...</p>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                  gap: '1rem'
                }}
              >
                {forecast.map((day, idx) => (
                  <div key={idx} className="bg-white dark:bg-gray-900" style={cardStyle}>
                    <div style={{ marginBottom: '0.5rem' }}>
                      <h3 className="text-gray-900 dark:text-gray-100" style={{ fontWeight: 'bold', margin: 0 }}>
                        {day.dayOfWeek}
                      </h3>
                      <p className="text-gray-500 dark:text-gray-400" style={{ margin: '0.25rem 0' }}>{day.date}</p>
                    </div>

                    <div style={{ marginBottom: '0.75rem' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          backgroundColor: getStatusColor(day.status),
                          color: 'white',
                          padding: '0.25rem 0.75rem',
                          borderRadius: '0.25rem',
                          fontSize: '0.875rem',
                          fontWeight: 'bold'
                        }}
                      >
                        {day.status}
                      </span>
                    </div>

                    <div className="text-gray-600 dark:text-gray-300" style={{ fontSize: '0.875rem' }}>
                      <p style={{ margin: '0.25rem 0' }}>
                        Staffed: <strong>{day.expectedCount}</strong> / {day.minimumRequired}
                      </p>
                      {day.gaps > 0 && (
                        <p className="text-red-500" style={{ margin: '0.25rem 0' }}>
                          Gap: <strong>{day.gaps}</strong> positions
                        </p>
                      )}
                    </div>

                    {day.scheduledMembers.length > 0 && (
                      <div style={{ marginTop: '0.75rem' }}>
                        <p className="text-gray-500 dark:text-gray-400" style={{ fontSize: '0.75rem', margin: '0.25rem 0' }}>
                          Scheduled: {day.scheduledMembers.length} members
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: Optimize */}
        {activeTab === 'optimize' && (
          <div style={tabStyle}>
            <div className="bg-white dark:bg-gray-900" style={cardStyle}>
              <h2 className="text-gray-900 dark:text-gray-100" style={{ marginBottom: '1rem' }}>Staffing Optimization</h2>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label className="text-gray-600 dark:text-gray-300" style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.25rem' }}>
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={dateRangeStart}
                    onChange={(e) => setDateRangeStart(e.target.value)}
                    className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700"
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      borderRadius: '0.5rem',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
                <div>
                  <label className="text-gray-600 dark:text-gray-300" style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.25rem' }}>
                    End Date
                  </label>
                  <input
                    type="date"
                    value={dateRangeEnd}
                    onChange={(e) => setDateRangeEnd(e.target.value)}
                    className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700"
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      borderRadius: '0.5rem',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label className="text-gray-600 dark:text-gray-300" style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.25rem' }}>
                  Minimum per Shift: {minPerShift}
                </label>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={minPerShift}
                  onChange={(e) => setMinPerShift(parseInt(e.target.value))}
                  style={{ width: '100%' }}
                />
              </div>

              <button
                onClick={handleOptimize}
                disabled={optimizeLoading}
                className="bg-blue-500 text-white"
                style={{
                  padding: '0.75rem 1.5rem',
                  borderRadius: '0.5rem',
                  border: 'none',
                  cursor: optimizeLoading ? 'not-allowed' : 'pointer',
                  fontWeight: 'bold',
                  opacity: optimizeLoading ? 0.6 : 1
                }}
              >
                {optimizeLoading ? 'Running...' : 'Run Optimization'}
              </button>
            </div>

            {optimizeResults && (
              <>
                <div className="bg-white dark:bg-gray-900" style={cardStyle}>
                  <h3 className="text-gray-900 dark:text-gray-100" style={{ marginBottom: '1rem' }}>Coverage Score</h3>
                  <div
                    className="bg-gray-200 dark:bg-gray-700"
                    style={{
                      width: '200px',
                      height: '200px',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '3rem',
                      fontWeight: 'bold',
                      color: optimizeResults.coverageScore >= 80 ? '#22c55e' : '#eab308'
                    }}
                  >
                    {optimizeResults.coverageScore}%
                  </div>
                </div>

                {optimizeResults.recommendations.length > 0 && (
                  <div className="bg-white dark:bg-gray-900" style={cardStyle}>
                    <h3 className="text-gray-900 dark:text-gray-100" style={{ marginBottom: '1rem' }}>AI Recommendations</h3>
                    {optimizeResults.recommendations.map((rec, idx) => (
                      <div
                        key={idx}
                        className="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300"
                        style={{
                          padding: '1rem',
                          borderRadius: '0.5rem',
                          marginBottom: '0.75rem',
                          fontSize: '0.875rem',
                          lineHeight: '1.6'
                        }}
                      >
                        {rec}
                      </div>
                    ))}
                  </div>
                )}

                {optimizeResults.riskAreas.length > 0 && (
                  <div className="bg-white dark:bg-gray-900" style={cardStyle}>
                    <h3 className="text-gray-900 dark:text-gray-100" style={{ marginBottom: '1rem' }}>Risk Areas</h3>
                    {optimizeResults.riskAreas.map((risk, idx) => (
                      <div
                        key={idx}
                        className="bg-red-50 dark:bg-red-950/50 border-l-4 border-red-500"
                        style={{
                          padding: '1rem',
                          borderRadius: '0.5rem',
                          marginBottom: '0.75rem'
                        }}
                      >
                        <h4 className="text-red-800 dark:text-red-300" style={{ margin: '0 0 0.25rem 0' }}>{risk.area}</h4>
                        <p className="text-red-800 dark:text-red-300" style={{ margin: 0, fontSize: '0.875rem' }}>{risk.description}</p>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* TAB 3: Patterns */}
        {activeTab === 'patterns' && (
          <div style={tabStyle}>
            {loading ? (
              <p className="text-gray-500 dark:text-gray-400">Loading patterns...</p>
            ) : patterns ? (
              <>
                <div className="bg-white dark:bg-gray-900" style={cardStyle}>
                  <h3 className="text-gray-900 dark:text-gray-100" style={{ marginBottom: '1rem' }}>Day-of-Week Staffing</h3>
                  <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', height: '200px' }}>
                    {patterns.patterns?.dayOfWeek &&
                      Object.entries(patterns.patterns.dayOfWeek).map(([day, stats]) => {
                        const maxShifts = Math.max(...Object.values(patterns.patterns.dayOfWeek).map(s => s.shifts || 1));
                        const height = ((stats.shifts || 0) / maxShifts) * 150;
                        return (
                          <div key={day} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <div
                              className="bg-blue-500"
                              style={{
                                width: '100%',
                                height: `${height}px`,
                                borderRadius: '0.25rem'
                              }}
                            />
                            <p className="text-gray-500 dark:text-gray-400" style={{ fontSize: '0.75rem', marginTop: '0.5rem' }}>
                              {day.slice(0, 3)}
                            </p>
                          </div>
                        );
                      })}
                  </div>
                </div>

                <div className="bg-white dark:bg-gray-900" style={cardStyle}>
                  <h3 className="text-gray-900 dark:text-gray-100" style={{ marginBottom: '1rem' }}>Peak Incident Hours</h3>
                  {patterns.patterns?.peakHours && patterns.patterns.peakHours.map((peak, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <div className="text-gray-500 dark:text-gray-400" style={{ width: '60px', fontSize: '0.875rem' }}>
                        {peak.hour}:00
                      </div>
                      <div
                        className="bg-blue-500"
                        style={{
                          flex: 1,
                          height: '20px',
                          borderRadius: '0.25rem',
                          width: `${(peak.incidents / 10) * 100}px`
                        }}
                      />
                      <div className="text-gray-500 dark:text-gray-400" style={{ width: '40px', textAlign: 'right', fontSize: '0.875rem' }}>
                        {peak.incidents}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="bg-white dark:bg-gray-900" style={cardStyle}>
                  <h3 className="text-gray-900 dark:text-gray-100" style={{ marginBottom: '1rem' }}>Key Insights</h3>
                  <p className="text-gray-600 dark:text-gray-300" style={{ fontSize: '0.875rem', lineHeight: '1.6' }}>
                    {patterns.correlations?.staffingVsResponse || 'Analyzing patterns...'}
                  </p>
                </div>
              </>
            ) : null}
          </div>
        )}

        {/* TAB 4: What-If Scenarios */}
        {activeTab === 'scenario' && (
          <div style={tabStyle}>
            <div className="bg-white dark:bg-gray-900" style={cardStyle}>
              <h2 className="text-gray-900 dark:text-gray-100" style={{ marginBottom: '1rem' }}>What-If Scenario Modeling</h2>

              <div style={{ marginBottom: '1rem' }}>
                <label className="text-gray-600 dark:text-gray-300" style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                  Scenario Description
                </label>
                <textarea
                  value={scenarioInput}
                  onChange={(e) => setScenarioInput(e.target.value)}
                  placeholder="Describe your what-if scenario..."
                  className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700"
                  style={{
                    width: '100%',
                    minHeight: '120px',
                    padding: '0.75rem',
                    borderRadius: '0.5rem',
                    boxSizing: 'border-box',
                    fontFamily: 'inherit'
                  }}
                />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <p className="text-gray-500 dark:text-gray-400" style={{ fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                  Example scenarios:
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {scenarioExamples.map((example, idx) => (
                    <button
                      key={idx}
                      onClick={() => setScenarioInput(example)}
                      className="bg-indigo-100 dark:bg-indigo-950/50 text-blue-500 dark:text-blue-300"
                      style={{
                        padding: '0.5rem 1rem',
                        borderRadius: '1rem',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '0.875rem'
                      }}
                    >
                      {example}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={handleModelScenario}
                disabled={scenarioLoading || !scenarioInput.trim()}
                className="bg-blue-500 text-white"
                style={{
                  padding: '0.75rem 1.5rem',
                  borderRadius: '0.5rem',
                  border: 'none',
                  cursor: scenarioLoading || !scenarioInput.trim() ? 'not-allowed' : 'pointer',
                  fontWeight: 'bold',
                  opacity: scenarioLoading || !scenarioInput.trim() ? 0.6 : 1
                }}
              >
                {scenarioLoading ? 'Modeling...' : 'Model Scenario'}
              </button>
            </div>

            {scenarioResults && (
              <>
                <div className="bg-white dark:bg-gray-900" style={cardStyle}>
                  <h3 className="text-gray-900 dark:text-gray-100" style={{ marginBottom: '1rem' }}>AI Analysis</h3>
                  <p className="text-gray-600 dark:text-gray-300" style={{ fontSize: '0.875rem', lineHeight: '1.8', whiteSpace: 'pre-wrap' }}>
                    {scenarioResults.analysis}
                  </p>
                </div>

                {scenarioResults.impact && (
                  <div className="bg-white dark:bg-gray-900" style={cardStyle}>
                    <h3 className="text-gray-900 dark:text-gray-100" style={{ marginBottom: '1rem' }}>Impact Summary</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                      <div className="bg-green-50 dark:bg-green-950/50" style={{ padding: '1rem', borderRadius: '0.5rem' }}>
                        <p className="text-gray-500 dark:text-gray-400" style={{ fontSize: '0.875rem', margin: 0 }}>Coverage Change</p>
                        <p className="text-blue-500 dark:text-blue-400" style={{ fontWeight: 'bold', fontSize: '1.25rem', margin: '0.5rem 0 0 0' }}>
                          {scenarioResults.impact.estimatedCoverageChange > 0 ? '+' : ''}{scenarioResults.impact.estimatedCoverageChange}%
                        </p>
                      </div>
                      <div className="bg-yellow-50 dark:bg-yellow-950/50" style={{ padding: '1rem', borderRadius: '0.5rem' }}>
                        <p className="text-gray-500 dark:text-gray-400" style={{ fontSize: '0.875rem', margin: 0 }}>Operational Risk</p>
                        <p className="text-yellow-500" style={{ fontWeight: 'bold', fontSize: '1.25rem', margin: '0.5rem 0 0 0' }}>
                          {scenarioResults.impact.operationalRisk}
                        </p>
                      </div>
                      <div className="bg-gray-100 dark:bg-gray-800" style={{ padding: '1rem', borderRadius: '0.5rem' }}>
                        <p className="text-gray-500 dark:text-gray-400" style={{ fontSize: '0.875rem', margin: 0 }}>Affected Shifts</p>
                        <p className="text-blue-500 dark:text-blue-400" style={{ fontWeight: 'bold', fontSize: '1rem', margin: '0.5rem 0 0 0' }}>
                          {scenarioResults.impact.affectedShifts}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {scenarioResults.recommendations && scenarioResults.recommendations.length > 0 && (
                  <div className="bg-white dark:bg-gray-900" style={cardStyle}>
                    <h3 className="text-gray-900 dark:text-gray-100" style={{ marginBottom: '1rem' }}>Recommendations</h3>
                    <ul className="text-gray-600 dark:text-gray-300" style={{ fontSize: '0.875rem', lineHeight: '1.8', paddingLeft: '1.5rem' }}>
                      {scenarioResults.recommendations.map((rec, idx) => (
                        <li key={idx}>{rec}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* TAB 5: Burnout Monitor */}
        {activeTab === 'burnout' && (
          <div style={tabStyle}>
            {loading ? (
              <p className="text-gray-500 dark:text-gray-400">Loading burnout data...</p>
            ) : burnoutData ? (
              <>
                {burnoutData.atRisk && burnoutData.atRisk.length > 0 && (
                  <div style={{ marginBottom: '2rem' }}>
                    <h2 className="text-gray-900 dark:text-gray-100" style={{ marginBottom: '1rem' }}>Members At Risk</h2>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
                      {burnoutData.atRisk.map((member, idx) => (
                        <div key={idx} className="bg-white dark:bg-gray-900" style={{
                          ...cardStyle,
                          borderLeft: `4px solid ${getRiskColor(member.riskLevel)}`
                        }}>
                          <h3 className="text-gray-900 dark:text-gray-100" style={{ margin: '0 0 1rem 0' }}>{member.name}</h3>
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            marginBottom: '0.5rem'
                          }}>
                            <span style={{
                              display: 'inline-block',
                              backgroundColor: getRiskColor(member.riskLevel),
                              color: 'white',
                              padding: '0.25rem 0.75rem',
                              borderRadius: '0.25rem',
                              fontSize: '0.875rem',
                              fontWeight: 'bold'
                            }}>
                              {member.riskLevel} Risk
                            </span>
                          </div>
                          <div className="text-gray-600 dark:text-gray-300" style={{ fontSize: '0.875rem' }}>
                            <p style={{ margin: '0.25rem 0' }}>Hours this month: <strong>{member.hoursThisMonth}</strong></p>
                            <p style={{ margin: '0.25rem 0' }}>Consecutive shifts: <strong>{member.consecutiveShifts}</strong></p>
                            <p style={{ margin: '0.25rem 0' }}>Incident responses: <strong>{member.incidentResponses}</strong></p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {burnoutData.stats && (
                  <div className="bg-white dark:bg-gray-900" style={cardStyle}>
                    <h3 className="text-gray-900 dark:text-gray-100" style={{ marginBottom: '1rem' }}>Department Statistics</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                      <div className="bg-gray-100 dark:bg-gray-800" style={{ padding: '1rem', borderRadius: '0.5rem' }}>
                        <p className="text-gray-500 dark:text-gray-400" style={{ fontSize: '0.875rem', margin: 0 }}>Avg Hours/Week</p>
                        <p className="text-blue-500 dark:text-blue-400" style={{ fontWeight: 'bold', fontSize: '2rem', margin: '0.5rem 0 0 0' }}>
                          {burnoutData.stats.avgHoursPerWeek}
                        </p>
                      </div>
                      <div className="bg-gray-100 dark:bg-gray-800" style={{ padding: '1rem', borderRadius: '0.5rem' }}>
                        <p className="text-gray-500 dark:text-gray-400" style={{ fontSize: '0.875rem', margin: 0 }}>Max Hours/Month</p>
                        <p className="text-red-500" style={{ fontWeight: 'bold', fontSize: '2rem', margin: '0.5rem 0 0 0' }}>
                          {burnoutData.stats.maxHoursThisMonth}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {burnoutData.stats?.topResponders && burnoutData.stats.topResponders.length > 0 && (
                  <div className="bg-white dark:bg-gray-900" style={cardStyle}>
                    <h3 className="text-gray-900 dark:text-gray-100" style={{ marginBottom: '1rem' }}>Top Responders (Last 30 Days)</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      {burnoutData.stats.topResponders.map((responder, idx) => (
                        <div key={idx} className={idx < burnoutData.stats.topResponders.length - 1 ? 'border-b border-gray-200 dark:border-gray-700' : ''} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '0.75rem' }}>
                          <span className="text-gray-900 dark:text-gray-100" style={{ fontWeight: '500' }}>
                            {idx + 1}. {responder.name}
                          </span>
                          <span className="bg-indigo-100 dark:bg-indigo-950/50 text-blue-500 dark:text-blue-300" style={{ padding: '0.25rem 0.75rem', borderRadius: '0.25rem', fontSize: '0.875rem', fontWeight: 'bold' }}>
                            {responder.incidents} incidents
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {burnoutData.healthy && burnoutData.healthy.length > 0 && (
                  <div className="bg-white dark:bg-gray-900" style={cardStyle}>
                    <h3 className="text-gray-900 dark:text-gray-100" style={{ marginBottom: '1rem' }}>Healthy Workload Members</h3>
                    <p className="text-green-500" style={{ fontWeight: 'bold', marginBottom: '1rem' }}>
                      {burnoutData.healthy.length} members with sustainable workload
                    </p>
                  </div>
                )}
              </>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
