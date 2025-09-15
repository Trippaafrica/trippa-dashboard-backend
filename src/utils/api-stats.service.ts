import { Injectable } from '@nestjs/common';
import { supabase } from '../auth/supabase.client';

@Injectable()
export class ApiStatsService {
  async getStats() {
    // Uptime: percent of successful requests in last 24h
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: totalCount, error: totalError } = await supabase
      .from('api_logs')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', since);
    const { count: errorCount, error: errorError } = await supabase
      .from('api_logs')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', since)
      .gte('status_code', 400);
    const { data: avgResp, error: avgRespError } = await supabase
      .from('api_logs')
      .select('response_time_ms')
      .gte('created_at', since);
    const { data: recent, error: recentError } = await supabase
      .from('api_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);

    const totalRequests = totalCount || 0;
    const errorRequests = errorCount || 0;
    const uptime = totalRequests > 0 ? (((totalRequests - errorRequests) / totalRequests) * 100).toFixed(2) : '100.00';
    const errorRate = totalRequests > 0 ? ((errorRequests / totalRequests) * 100).toFixed(2) : '0.00';
    const avgResponseTime = avgResp && avgResp.length > 0 ?
      (avgResp.reduce((sum, row) => sum + row.response_time_ms, 0) / avgResp.length).toFixed(0) : '0';

    // Endpoint-level stats: count and avg response time per endpoint (last 24h)
    const { data: endpointLogs, error: endpointError } = await supabase
      .from('api_logs')
      .select('endpoint, response_time_ms')
      .gte('created_at', since);

    // Aggregate by endpoint
    const endpointMap = {};
    (endpointLogs || []).forEach(row => {
      if (!endpointMap[row.endpoint]) {
        endpointMap[row.endpoint] = { endpoint: row.endpoint, totalTime: 0, count: 0 };
      }
      endpointMap[row.endpoint].totalTime += row.response_time_ms;
      endpointMap[row.endpoint].count += 1;
    });
    const endpointStats = Object.values(endpointMap)
      .map((e: any) => ({
        endpoint: e.endpoint,
        calls: e.count,
        responseTime: e.count > 0 ? Math.round(e.totalTime / e.count) + 'ms' : '0ms',
      }))
      .sort((a, b) => b.calls - a.calls)
      .slice(0, 5); // Top 5 endpoints

    return {
      uptime: uptime + '%',
      responseTime: avgResponseTime + 'ms',
      errorRate: errorRate + '%',
      requests: totalRequests,
      status: Number(uptime),
      recentErrors: (recent || []).filter(r => r.status_code >= 400),
      endpointStats,
    };
  }
}
