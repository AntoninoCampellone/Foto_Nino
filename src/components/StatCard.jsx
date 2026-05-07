function StatCard({ value, label }) {
  return (
    <div className="stat-box">
      <span className="stat-number">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  )
}

export default StatCard