import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';
import AIWriteTextarea from './AIWriteTextarea';

export default function ReportWriter() {
  const [activeTab, setActiveTab] = useState('after-action');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // After-Action Report state
  const [incidents, setIncidents] = useState([]);
  const [selectedIncident, setSelectedIncident] = useState('');
  const [afterActionReport, setAfterActionReport] = useState(null);

  // Monthly Report state
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [monthlyReport, setMonthlyReport] = useState(null);

  // Executive Summary state
  const [summaryTitle, setSummaryTitle] = useState('');
  const [summaryContext, setSummaryContext] = useState('');
  const [summaryData, setSummaryData] = useState('');
  const [executiveSummary, setExecutiveSummary] = useState(null);

  // Mutual Aid Report state
  const [daysBack, setDaysBack] = useState(30);
  const [mutualAidReport, setMutualAidReport] = useState(null);

  // Load incidents on component mount
  useEffect(() => {
    loadIncidents();
  }, []);

  const loadIncidents = async () => {
    try {
      const raw = await api.get('/incidents');
      const data = Array.isArray(raw?.data) ? raw.data : Array.isArray(raw) ? raw : [];
      setIncidents(data);
    } catch (err) {
      console.error('Failed to load incidents:', err);
    }
  };

  const handleGenerateAfterAction = async () => {
    if (!selectedIncident) {
      setError('Please select an incident');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await api.post('/report-writer/after-action', {
        incidentId: selectedIncident
      });
      setAfterActionReport(result.report || result);
    } catch (err) {
      setError(err.message || 'Failed to generate after-action report');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateMonthly = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await api.post('/report-writer/monthly', {
        month: selectedMonth,
        year: selectedYear
      });
      setMonthlyReport(result.report || result);
    } catch (err) {
      setError(err.message || 'Failed to generate monthly report');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateExecutiveSummary = async () => {
    if (!summaryTitle || !summaryContext) {
      setError('Title and context are required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await api.post('/report-writer/executive-summary', {
        title: summaryTitle,
        context: summaryContext,
        data: summaryData
      });
      setExecutiveSummary(result);
    } catch (err) {
      setError(err.message || 'Failed to generate executive summary');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateMutualAid = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await api.post('/report-writer/mutual-aid', {
        daysBack
      });
      setMutualAidReport(result.report || result);
    } catch (err) {
      setError(err.message || 'Failed to generate mutual aid report');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    alert('Copied to clipboard!');
  };

  const formatReportText = (sections) => {
    if (!Array.isArray(sections)) return '';
    return sections.map(s => `${s.heading}\n${s.content}`).join('\n\n');
  };

  const tabStyle = {
    padding: '24px',
    display: activeTab === 'after-action' ? 'block' : 'none'
  };

  const containerStyle = {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '20px'
  };

  const tabsStyle = {
    display: 'flex',
    gap: '8px',
    marginBottom: '24px',
    borderBottom: '1px solid #e2e8f0'
  };

  const tabButtonStyle = (isActive) => ({
    padding: '12px 20px',
    backgroundColor: 'transparent',
    border: 'none',
    borderBottom: isActive ? '3px solid #3b82f6' : '3px solid transparent',
    color: isActive ? '#3b82f6' : '#64748b',
    fontWeight: isActive ? '600' : '500',
    cursor: 'pointer',
    fontSize: '14px'
  });

  const cardStyle = {
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '20px',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
    marginBottom: '20px'
  };

  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    fontSize: '14px',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
    marginBottom: '12px'
  };

  const textareaStyle = {
    ...inputStyle,
    minHeight: '100px',
    fontFamily: 'monospace',
    fontSize: '13px',
    resize: 'vertical'
  };

  const buttonStyle = {
    backgroundColor: '#3b82f6',
    color: 'white',
    border: 'none',
    padding: '10px 20px',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: '500',
    fontSize: '14px',
    marginRight: '10px'
  };

  const secondaryButtonStyle = {
    ...buttonStyle,
    backgroundColor: '#94a3b8'
  };

  const reportStyle = {
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '24px',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
    lineHeight: '1.6'
  };

  const reportHeaderStyle = {
    marginBottom: '24px',
    paddingBottom: '16px',
    borderBottom: '2px solid #e2e8f0'
  };

  const reportTitleStyle = {
    fontSize: '24px',
    fontWeight: '700',
    color: '#0f172a',
    margin: '0 0 8px 0'
  };

  const reportSubtitleStyle = {
    fontSize: '14px',
    color: '#64748b',
    margin: '0'
  };

  const sectionStyle = {
    marginBottom: '24px'
  };

  const sectionHeadingStyle = {
    fontSize: '18px',
    fontWeight: '600',
    color: '#3b82f6',
    marginBottom: '12px'
  };

  const sectionContentStyle = {
    color: '#334155',
    lineHeight: '1.6',
    whiteSpace: 'pre-wrap'
  };

  const statsContainerStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: '16px',
    marginBottom: '24px'
  };

  const statCardStyle = {
    backgroundColor: '#f1f5f9',
    borderRadius: '8px',
    padding: '16px',
    textAlign: 'center'
  };

  const statValueStyle = {
    fontSize: '28px',
    fontWeight: '700',
    color: '#3b82f6',
    margin: '0'
  };

  const statLabelStyle = {
    fontSize: '12px',
    color: '#64748b',
    marginTop: '4px',
    margin: '4px 0 0 0'
  };

  const errorStyle = {
    backgroundColor: '#fee2e2',
    color: '#991b1b',
    padding: '12px 16px',
    borderRadius: '8px',
    marginBottom: '16px'
  };

  const labelStyle = {
    display: 'block',
    fontSize: '14px',
    fontWeight: '500',
    color: '#334155',
    marginBottom: '8px'
  };

  const rowStyle = {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px'
  };

  const keyPointsStyle = {
    listStyle: 'none',
    padding: 0,
    margin: '0'
  };

  const keyPointItemStyle = {
    padding: '8px 0 8px 24px',
    position: 'relative',
    color: '#334155',
    lineHeight: '1.6'
  };

  // Render key points with bullet
  const renderKeyPoints = (points) => {
    const safePoints = Array.isArray(points) ? points : [];
    return (
      <ul style={keyPointsStyle}>
        {safePoints.map((point, idx) => (
          <li key={idx} style={keyPointItemStyle}>
            <span style={{ position: 'absolute', left: '0' }}>•</span>
            {point}
          </li>
        ))}
      </ul>
    );
  };

  return (
    <div style={containerStyle}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: '700', color: '#0f172a', margin: '0' }}>Report Writer</h1>
        <p style={{ fontSize: '14px', color: '#64748b', margin: '8px 0 0 0' }}>Generate professional reports from incident data and department metrics</p>
      </div>

      <div style={tabsStyle}>
        <button style={tabButtonStyle(activeTab === 'after-action')} onClick={() => setActiveTab('after-action')}>
          After-Action Report
        </button>
        <button style={tabButtonStyle(activeTab === 'monthly')} onClick={() => setActiveTab('monthly')}>
          Monthly Report
        </button>
        <button style={tabButtonStyle(activeTab === 'executive')} onClick={() => setActiveTab('executive')}>
          Executive Summary
        </button>
        <button style={tabButtonStyle(activeTab === 'mutual-aid')} onClick={() => setActiveTab('mutual-aid')}>
          Mutual Aid Report
        </button>
      </div>

      {error && <div style={errorStyle}>{error}</div>}

      {/* After-Action Report Tab */}
      <div style={{ ...tabStyle, display: activeTab === 'after-action' ? 'block' : 'none' }}>
        <div style={cardStyle}>
          <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#0f172a', marginTop: '0' }}>Select Incident</h2>
          <label style={labelStyle}>Incident</label>
          <select value={selectedIncident} onChange={(e) => setSelectedIncident(e.target.value)} style={inputStyle}>
            <option value="">-- Choose an incident --</option>
            {incidents.map(inc => (
              <option key={inc.id} value={inc.id}>
                {inc.title} ({new Date(inc.date).toLocaleDateString()})
              </option>
            ))}
          </select>
          <button style={buttonStyle} onClick={handleGenerateAfterAction} disabled={loading}>
            {loading ? 'Generating...' : 'Generate Report'}
          </button>
        </div>

        {afterActionReport && (
          <div style={reportStyle}>
            <div style={reportHeaderStyle}>
              <h2 style={reportTitleStyle}>{afterActionReport.title}</h2>
              <p style={reportSubtitleStyle}>{afterActionReport.type} • {afterActionReport.date}</p>
            </div>

            {Array.isArray(afterActionReport.sections) && afterActionReport.sections.map((section, idx) => (
              <div key={idx} style={sectionStyle}>
                <h3 style={sectionHeadingStyle}>{section.heading}</h3>
                <div style={sectionContentStyle}>{section.content}</div>
              </div>
            ))}

            <button style={secondaryButtonStyle} onClick={() => copyToClipboard(formatReportText(afterActionReport.sections))}>
              Copy to Clipboard
            </button>
          </div>
        )}
      </div>

      {/* Monthly Report Tab */}
      <div style={{ ...tabStyle, display: activeTab === 'monthly' ? 'block' : 'none' }}>
        <div style={cardStyle}>
          <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#0f172a', marginTop: '0' }}>Generate Monthly Report</h2>
          <div style={rowStyle}>
            <div>
              <label style={labelStyle}>Month</label>
              <select value={selectedMonth} onChange={(e) => setSelectedMonth(parseInt(e.target.value))} style={inputStyle}>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => (
                  <option key={m} value={m}>
                    {new Date(2000, m - 1).toLocaleString('default', { month: 'long' })}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Year</label>
              <input type="number" value={selectedYear} onChange={(e) => setSelectedYear(parseInt(e.target.value))} style={inputStyle} />
            </div>
          </div>
          <button style={buttonStyle} onClick={handleGenerateMonthly} disabled={loading}>
            {loading ? 'Generating...' : 'Generate Report'}
          </button>
        </div>

        {monthlyReport && (
          <div style={reportStyle}>
            <div style={reportHeaderStyle}>
              <h2 style={reportTitleStyle}>{monthlyReport.title}</h2>
              <p style={reportSubtitleStyle}>{monthlyReport.period}</p>
            </div>

            {monthlyReport.stats && (
              <div style={statsContainerStyle}>
                <div style={statCardStyle}>
                  <p style={statValueStyle}>{monthlyReport.stats.incidentCount}</p>
                  <p style={statLabelStyle}>Incidents</p>
                </div>
                <div style={statCardStyle}>
                  <p style={statValueStyle}>{monthlyReport.stats.activeMembers}</p>
                  <p style={statLabelStyle}>Active Members</p>
                </div>
                <div style={statCardStyle}>
                  <p style={statValueStyle}>{monthlyReport.stats.trainingHours.toFixed(1)}</p>
                  <p style={statLabelStyle}>Training Hours</p>
                </div>
                <div style={statCardStyle}>
                  <p style={statValueStyle}>{monthlyReport.stats.totalPersonnelDeployed}</p>
                  <p style={statLabelStyle}>Personnel Deployed</p>
                </div>
              </div>
            )}

            {Array.isArray(monthlyReport.sections) && monthlyReport.sections.map((section, idx) => (
              <div key={idx} style={sectionStyle}>
                <h3 style={sectionHeadingStyle}>{section.heading}</h3>
                <div style={sectionContentStyle}>{section.content}</div>
              </div>
            ))}

            <button style={secondaryButtonStyle} onClick={() => copyToClipboard(formatReportText(monthlyReport.sections))}>
              Copy to Clipboard
            </button>
          </div>
        )}
      </div>

      {/* Executive Summary Tab */}
      <div style={{ ...tabStyle, display: activeTab === 'executive' ? 'block' : 'none' }}>
        <div style={cardStyle}>
          <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#0f172a', marginTop: '0' }}>Generate Executive Summary</h2>
          <label style={labelStyle}>Title</label>
          <input type="text" value={summaryTitle} onChange={(e) => setSummaryTitle(e.target.value)} placeholder="e.g., Q1 Performance Summary" style={inputStyle} />

          <label style={labelStyle}>Context</label>
          <AIWriteTextarea value={summaryContext} onChange={(e) => setSummaryContext(e.target.value)} placeholder="What is this summary about?" rows={4} name="summaryContext" id="summaryContext" />

          <label style={labelStyle}>Data / Notes (optional)</label>
          <AIWriteTextarea value={summaryData} onChange={(e) => setSummaryData(e.target.value)} placeholder="Paste data, metrics, or additional context here..." rows={4} name="summaryData" id="summaryData" />

          <button style={buttonStyle} onClick={handleGenerateExecutiveSummary} disabled={loading}>
            {loading ? 'Generating...' : 'Generate Summary'}
          </button>
        </div>

        {executiveSummary && (
          <div style={reportStyle}>
            <div style={sectionStyle}>
              <h3 style={sectionHeadingStyle}>Summary</h3>
              <div style={sectionContentStyle}>{executiveSummary.summary}</div>
            </div>

            {Array.isArray(executiveSummary.keyPoints) && executiveSummary.keyPoints.length > 0 && (
              <div style={sectionStyle}>
                <h3 style={sectionHeadingStyle}>Key Points</h3>
                {renderKeyPoints(executiveSummary.keyPoints)}
              </div>
            )}

            {Array.isArray(executiveSummary.recommendations) && executiveSummary.recommendations.length > 0 && (
              <div style={sectionStyle}>
                <h3 style={sectionHeadingStyle}>Recommendations</h3>
                {renderKeyPoints(executiveSummary.recommendations)}
              </div>
            )}

            <button style={secondaryButtonStyle} onClick={() => copyToClipboard(`${executiveSummary.summary}\n\n${executiveSummary.keyPoints?.join('\n') || ''}\n\n${executiveSummary.recommendations?.join('\n') || ''}`)}>
              Copy to Clipboard
            </button>
          </div>
        )}
      </div>

      {/* Mutual Aid Report Tab */}
      <div style={{ ...tabStyle, display: activeTab === 'mutual-aid' ? 'block' : 'none' }}>
        <div style={cardStyle}>
          <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#0f172a', marginTop: '0' }}>Generate Mutual Aid Report</h2>
          <label style={labelStyle}>Days Back</label>
          <input type="number" value={daysBack} onChange={(e) => setDaysBack(parseInt(e.target.value))} style={inputStyle} />
          <button style={buttonStyle} onClick={handleGenerateMutualAid} disabled={loading}>
            {loading ? 'Generating...' : 'Generate Report'}
          </button>
        </div>

        {mutualAidReport && (
          <div style={reportStyle}>
            <div style={reportHeaderStyle}>
              <h2 style={reportTitleStyle}>{mutualAidReport.title}</h2>
            </div>

            {mutualAidReport.stats && (
              <div style={statsContainerStyle}>
                <div style={statCardStyle}>
                  <p style={statValueStyle}>{mutualAidReport.stats.given}</p>
                  <p style={statLabelStyle}>Aid Given</p>
                </div>
                <div style={statCardStyle}>
                  <p style={statValueStyle}>{mutualAidReport.stats.received}</p>
                  <p style={statLabelStyle}>Aid Received</p>
                </div>
                <div style={statCardStyle}>
                  <p style={statValueStyle}>{mutualAidReport.stats.total}</p>
                  <p style={statLabelStyle}>Total Activities</p>
                </div>
              </div>
            )}

            {Array.isArray(mutualAidReport.sections) && mutualAidReport.sections.map((section, idx) => (
              <div key={idx} style={sectionStyle}>
                <h3 style={sectionHeadingStyle}>{section.heading}</h3>
                <div style={sectionContentStyle}>{section.content}</div>
              </div>
            ))}

            <button style={secondaryButtonStyle} onClick={() => copyToClipboard(formatReportText(mutualAidReport.sections))}>
              Copy to Clipboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
