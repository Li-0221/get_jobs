package com.getjobs.worker.boss;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class HrActivityFilterTest {
    @ParameterizedTest
    @ValueSource(strings = {"刚刚活跃", "今日活跃", "3日内活跃", "本周活跃", "本月活跃", "半年前活跃"})
    void onlyExplicitlySelectedStatesPass(String selected) {
        assertFalse(HrActivityFilter.shouldFilter(true, List.of(selected), selected));
        assertTrue(HrActivityFilter.shouldFilter(true, List.of(selected), "未勾选状态"));
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {" ", "未知", "今日活跃（未确认）", "非今日活跃"})
    void missingOrNonMatchingStatesAreSkipped(String status) {
        assertTrue(HrActivityFilter.shouldFilter(true, List.of("今日活跃"), status));
    }

    @Test
    void emptySelectionBlocksEverythingButDisabledSwitchAllowsEverything() {
        assertTrue(HrActivityFilter.shouldFilter(true, List.of(), "今日活跃"));
        assertTrue(HrActivityFilter.shouldFilter(true, List.of(), null));
        assertFalse(HrActivityFilter.shouldFilter(false, List.of(), null));
        assertFalse(HrActivityFilter.shouldFilter(null, List.of(), "半年前活跃"));
    }

    @Test
    void nullSelectionKeepsLegacyBehaviourAndDoesNotMeanEmptySelection() {
        assertFalse(HrActivityFilter.shouldFilter(true, null, "本月活跃"));
        assertFalse(HrActivityFilter.shouldFilter(true, null, null));
        assertTrue(HrActivityFilter.shouldFilter(true, null, "半年前活跃"));
        assertFalse(HrActivityFilter.shouldFilter(true, List.of("半年前活跃"), "半年前活跃"));
    }
}
