package com.getjobs.worker.boss;

import java.util.List;

/** 仅按用户选择的平台状态原文放行；null 保留旧配置行为，空列表表示全部过滤。 */
public final class HrActivityFilter {
    public static final List<String> KNOWN_STATUSES = List.of(
            "刚刚活跃", "今日活跃", "3日内活跃", "本周活跃", "2周内活跃", "本月活跃",
            "2月内活跃", "3月内活跃", "4月内活跃", "5月内活跃", "近半年活跃", "半年前活跃");

    private HrActivityFilter() {}

    public static boolean shouldFilter(Boolean enabled, List<String> allowedStatuses, String status) {
        if (!Boolean.TRUE.equals(enabled)) return false;
        // 老版本只过滤包含“年”的HR，升级且未保存新设置时维持原行为。
        if (allowedStatuses == null) return status != null && status.contains("年");
        return status == null || status.isBlank() || !allowedStatuses.contains(status.strip());
    }
}
