package com.getjobs.application.service;

import com.getjobs.application.entity.BossConfigEntity;
import com.getjobs.application.mapper.BossConfigMapper;
import com.getjobs.application.mapper.BossJobDataMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.sqlite.SQLiteDataSource;

import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class BossHrActivityConfigTest {
    @TempDir Path directory;

    @Test
    void oldDatabaseMigrationIsIdempotentAndPreservesExplicitEmptySelection() throws Exception {
        SQLiteDataSource source = new SQLiteDataSource();
        source.setUrl("jdbc:sqlite:" + directory.resolve("test.db"));
        BossService service = new BossService(null, null, null, null, null, source);
        try (var connection = source.getConnection(); var statement = connection.createStatement()) {
            statement.execute("CREATE TABLE boss_config (id INTEGER PRIMARY KEY, say_hi TEXT)");
            statement.execute("INSERT INTO boss_config VALUES (1, '原有招呼语')");
            service.ensureHrActivityColumn();
            try (var rows = statement.executeQuery("SELECT say_hi, allowed_hr_statuses FROM boss_config")) {
                assertTrue(rows.next());
                assertEquals("原有招呼语", rows.getString(1));
                assertNull(rows.getString(2));
            }
            statement.execute("UPDATE boss_config SET allowed_hr_statuses = '[]'");
            service.ensureHrActivityColumn();
            try (var rows = statement.executeQuery("SELECT allowed_hr_statuses FROM boss_config")) {
                assertTrue(rows.next());
                assertEquals("[]", rows.getString(1));
            }
        }
    }

    @Test
    void selectiveSavePreservesOmittedSelectionAndSupportsClearingIt() {
        BossConfigMapper mapper = mock(BossConfigMapper.class);
        BossConfigEntity existing = new BossConfigEntity();
        existing.setId(1L);
        existing.setAllowedHrStatuses("[\"今日活跃\"]");
        when(mapper.selectOne(any())).thenReturn(existing);
        BossService service = new BossService(null, null, mapper, null, null, null);
        assertEquals("[\"今日活跃\"]", service.saveOrUpdateFirstSelective(new BossConfigEntity()).getAllowedHrStatuses());
        BossConfigEntity update = new BossConfigEntity();
        update.setAllowedHrStatuses("[]");
        assertEquals("[]", service.saveOrUpdateFirstSelective(update).getAllowedHrStatuses());
    }

    @Test
    void optionsIncludeObservedAndSavedStatesWithoutDuplicates() {
        BossConfigMapper configs = mock(BossConfigMapper.class);
        BossJobDataMapper jobs = mock(BossJobDataMapper.class);
        BossConfigEntity config = new BossConfigEntity();
        config.setAllowedHrStatuses("[\"昨天活跃\"]");
        when(configs.selectOne(any())).thenReturn(config);
        when(jobs.selectObjs(any())).thenReturn(List.of("今日活跃", "新平台状态", " "));
        BossService service = new BossService(null, null, configs, null, jobs, null);
        List<String> options = service.getHrActivityStatuses();
        assertTrue(options.containsAll(List.of("今日活跃", "新平台状态", "昨天活跃")));
        assertEquals(1, options.stream().filter("今日活跃"::equals).count());
        assertFalse(options.contains(" "));
    }
}
