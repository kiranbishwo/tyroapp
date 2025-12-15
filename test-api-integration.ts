/**
 * API Integration Test Script
 * Tests all APIs documented in DESKTOP_APP_API_DOCUMENTATION.md
 * 
 * Run this script to verify all API endpoints are working correctly
 */

import { apiService } from './services/apiService';
import { authState } from './services/authState';

interface ApiTestResult {
    apiName: string;
    endpoint: string;
    method: string;
    implemented: boolean;
    tested: boolean;
    success: boolean;
    error?: string;
    response?: any;
}

const testResults: ApiTestResult[] = [];

/**
 * Test Projects API
 */
async function testProjectsAPI(): Promise<void> {
    console.log('\n📋 Testing Projects API...');
    
    // Test: GET /api/vue/backend/v1/projects
    const test1: ApiTestResult = {
        apiName: 'Get User\'s Assigned Projects',
        endpoint: 'GET /api/vue/backend/v1/projects',
        method: 'GET',
        implemented: true,
        tested: false,
        success: false,
    };
    
    try {
        const workspaceId = authState.getCurrentWorkspace()?.workspace_id?.toString();
        const response = await apiService.getProjects({ workspace_id: workspaceId });
        
        test1.tested = true;
        test1.success = response.success;
        test1.response = response.data;
        
        if (response.success) {
            console.log(`  ✅ GET /api/vue/backend/v1/projects - Success (${response.data?.length || 0} projects)`);
        } else {
            console.log(`  ❌ GET /api/vue/backend/v1/projects - Failed: ${response.error}`);
            test1.error = response.error;
        }
    } catch (error: any) {
        test1.tested = true;
        test1.success = false;
        test1.error = error.message;
        console.log(`  ❌ GET /api/vue/backend/v1/projects - Error: ${error.message}`);
    }
    
    testResults.push(test1);
}

/**
 * Test Tasks API
 */
async function testTasksAPI(): Promise<void> {
    console.log('\n📝 Testing Tasks API...');
    
    // Test: GET /api/vue/backend/v1/tasks
    const test1: ApiTestResult = {
        apiName: 'Get User\'s Assigned Tasks',
        endpoint: 'GET /api/vue/backend/v1/tasks',
        method: 'GET',
        implemented: true,
        tested: false,
        success: false,
    };
    
    try {
        const workspaceId = authState.getCurrentWorkspace()?.workspace_id?.toString();
        const response = await apiService.getTasks({ workspace_id: workspaceId });
        
        test1.tested = true;
        test1.success = response.success;
        test1.response = response.data;
        
        if (response.success) {
            console.log(`  ✅ GET /api/vue/backend/v1/tasks - Success (${response.data?.length || 0} tasks)`);
        } else {
            console.log(`  ❌ GET /api/vue/backend/v1/tasks - Failed: ${response.error}`);
            test1.error = response.error;
        }
    } catch (error: any) {
        test1.tested = true;
        test1.success = false;
        test1.error = error.message;
        console.log(`  ❌ GET /api/vue/backend/v1/tasks - Error: ${error.message}`);
    }
    
    testResults.push(test1);
}

/**
 * Test Tracking Data API
 */
async function testTrackingDataAPI(): Promise<void> {
    console.log('\n📊 Testing Tracking Data API...');
    
    // Test 1: POST /api/vue/backend/v1/tracking-files/upload
    const test1: ApiTestResult = {
        apiName: 'Upload Tracking Data File',
        endpoint: 'POST /api/vue/backend/v1/tracking-files/upload',
        method: 'POST',
        implemented: true,
        tested: false,
        success: false,
    };
    
    try {
        // Create a sample tracking file
        const sampleData = {
            version: '1.0.0',
            metadata: {
                createdAt: new Date().toISOString(),
                lastUpdated: new Date().toISOString(),
                taskId: 'test-task',
                projectId: 'test-project',
                taskName: 'Test Task',
                projectName: 'Test Project',
                currentSessionStart: new Date().toISOString(),
            },
            trackingData: {
                activityLogs: [],
                windowTracking: [],
                summary: {
                    totalTime: 0,
                    totalKeystrokes: 0,
                    totalMouseClicks: 0,
                    totalScreenshots: 0,
                    totalWebcamPhotos: 0,
                    totalUrls: 0,
                    totalActivityLogs: 0,
                    firstActivity: null,
                    lastActivity: new Date().toISOString(),
                },
            },
        };
        
        const jsonString = JSON.stringify(sampleData);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const file = new File([blob], 'test-task.json', { type: 'application/json' });
        
        const workspaceId = authState.getCurrentWorkspace()?.workspace_id?.toString();
        const response = await apiService.uploadTrackingFile('test-project', 'test-task', file, workspaceId);
        
        test1.tested = true;
        test1.success = response.success;
        test1.response = response.data;
        
        if (response.success) {
            console.log(`  ✅ POST /api/vue/backend/v1/tracking-files/upload - Success`);
        } else {
            console.log(`  ⚠️  POST /api/vue/backend/v1/tracking-files/upload - Failed: ${response.error} (may need valid project/task IDs)`);
            test1.error = response.error;
        }
    } catch (error: any) {
        test1.tested = true;
        test1.success = false;
        test1.error = error.message;
        console.log(`  ❌ POST /api/vue/backend/v1/tracking-files/upload - Error: ${error.message}`);
    }
    
    testResults.push(test1);
    
    // Test 2: GET /api/vue/backend/v1/tracking-data
    const test2: ApiTestResult = {
        apiName: 'List Tracking Data',
        endpoint: 'GET /api/vue/backend/v1/tracking-data',
        method: 'GET',
        implemented: true,
        tested: false,
        success: false,
    };
    
    try {
        const response = await apiService.listTrackingData({
            project_id: '1',
            task_id: 't1',
            start_date: '2025-01-01',
            end_date: new Date().toISOString().split('T')[0],
        });
        
        test2.tested = true;
        test2.success = response.success;
        test2.response = response.data;
        
        if (response.success) {
            console.log(`  ✅ GET /api/vue/backend/v1/tracking-data - Success (${response.data?.length || 0} records)`);
        } else {
            console.log(`  ⚠️  GET /api/vue/backend/v1/tracking-data - Failed: ${response.error} (may need valid project/task IDs)`);
            test2.error = response.error;
        }
    } catch (error: any) {
        test2.tested = true;
        test2.success = false;
        test2.error = error.message;
        console.log(`  ❌ GET /api/vue/backend/v1/tracking-data - Error: ${error.message}`);
    }
    
    testResults.push(test2);
    
    // Test 3: GET /api/vue/backend/v1/tracking-data/{id}
    const test3: ApiTestResult = {
        apiName: 'Get Tracking Data by ID',
        endpoint: 'GET /api/vue/backend/v1/tracking-data/{id}',
        method: 'GET',
        implemented: true,
        tested: false,
        success: false,
    };
    
    try {
        const response = await apiService.getTrackingDataById(1);
        
        test3.tested = true;
        test3.success = response.success;
        test3.response = response.data;
        
        if (response.success) {
            console.log(`  ✅ GET /api/vue/backend/v1/tracking-data/{id} - Success`);
        } else {
            console.log(`  ⚠️  GET /api/vue/backend/v1/tracking-data/{id} - Failed: ${response.error} (may need valid ID)`);
            test3.error = response.error;
        }
    } catch (error: any) {
        test3.tested = true;
        test3.success = false;
        test3.error = error.message;
        console.log(`  ❌ GET /api/vue/backend/v1/tracking-data/{id} - Error: ${error.message}`);
    }
    
    testResults.push(test3);
}

/**
 * Test Status Management API
 */
async function testStatusManagementAPI(): Promise<void> {
    console.log('\n🔄 Testing Status Management API...');
    
    // Test 1: POST /api/vue/backend/v1/status/update
    const test1: ApiTestResult = {
        apiName: 'Update User Status',
        endpoint: 'POST /api/vue/backend/v1/status/update',
        method: 'POST',
        implemented: true,
        tested: false,
        success: false,
    };
    
    try {
        const workspaceId = authState.getCurrentWorkspace()?.workspace_id?.toString();
        const response = await apiService.updateStatus({
            status: 'working',
            workspace_id: workspaceId,
            metadata: {
                task_id: 'test-task',
                project_id: 'test-project',
            },
        });
        
        test1.tested = true;
        test1.success = response.success;
        test1.response = response.data;
        
        if (response.success) {
            console.log(`  ✅ POST /api/vue/backend/v1/status/update - Success`);
        } else {
            console.log(`  ❌ POST /api/vue/backend/v1/status/update - Failed: ${response.error}`);
            test1.error = response.error;
        }
    } catch (error: any) {
        test1.tested = true;
        test1.success = false;
        test1.error = error.message;
        console.log(`  ❌ POST /api/vue/backend/v1/status/update - Error: ${error.message}`);
    }
    
    testResults.push(test1);
    
    // Test 2: GET /api/vue/backend/v1/status/current
    const test2: ApiTestResult = {
        apiName: 'Get Current Status',
        endpoint: 'GET /api/vue/backend/v1/status/current',
        method: 'GET',
        implemented: true,
        tested: false,
        success: false,
    };
    
    try {
        const response = await apiService.getCurrentStatus();
        
        test2.tested = true;
        test2.success = response.success;
        test2.response = response.data;
        
        if (response.success) {
            const status = response.data?.status || 'No active status';
            console.log(`  ✅ GET /api/vue/backend/v1/status/current - Success (Status: ${status})`);
        } else {
            console.log(`  ❌ GET /api/vue/backend/v1/status/current - Failed: ${response.error}`);
            test2.error = response.error;
        }
    } catch (error: any) {
        test2.tested = true;
        test2.success = false;
        test2.error = error.message;
        console.log(`  ❌ GET /api/vue/backend/v1/status/current - Error: ${error.message}`);
    }
    
    testResults.push(test2);
    
    // Test 3: GET /api/vue/backend/v1/status/history
    const test3: ApiTestResult = {
        apiName: 'Get Status History',
        endpoint: 'GET /api/vue/backend/v1/status/history',
        method: 'GET',
        implemented: true,
        tested: false,
        success: false,
    };
    
    try {
        const response = await apiService.getStatusHistory({
            start_date: '2025-01-01',
            end_date: new Date().toISOString().split('T')[0],
        });
        
        test3.tested = true;
        test3.success = response.success;
        test3.response = response.data;
        
        if (response.success) {
            console.log(`  ✅ GET /api/vue/backend/v1/status/history - Success (${response.data?.length || 0} records)`);
        } else {
            console.log(`  ❌ GET /api/vue/backend/v1/status/history - Failed: ${response.error}`);
            test3.error = response.error;
        }
    } catch (error: any) {
        test3.tested = true;
        test3.success = false;
        test3.error = error.message;
        console.log(`  ❌ GET /api/vue/backend/v1/status/history - Error: ${error.message}`);
    }
    
    testResults.push(test3);
}

/**
 * Main test function
 */
export async function runAllAPITests(): Promise<void> {
    console.log('🚀 Starting API Integration Tests...');
    console.log('=' .repeat(60));
    
    // Check authentication
    const isAuthenticated = authState.isAuthenticated();
    if (!isAuthenticated) {
        console.log('⚠️  User is not authenticated. Some tests may fail.');
        console.log('   Please ensure you are logged in before running tests.');
    } else {
        console.log('✅ User is authenticated');
    }
    
    // Check workspace
    const workspace = authState.getCurrentWorkspace();
    if (!workspace) {
        console.log('⚠️  No workspace selected. Some tests may fail.');
    } else {
        console.log(`✅ Workspace selected: ${workspace.workspace_name}`);
    }
    
    console.log('=' .repeat(60));
    
    // Run all tests
    await testProjectsAPI();
    await testTasksAPI();
    await testTrackingDataAPI();
    await testStatusManagementAPI();
    
    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 Test Summary');
    console.log('='.repeat(60));
    
    const total = testResults.length;
    const implemented = testResults.filter(t => t.implemented).length;
    const tested = testResults.filter(t => t.tested).length;
    const successful = testResults.filter(t => t.success).length;
    const failed = testResults.filter(t => t.tested && !t.success).length;
    
    console.log(`Total APIs: ${total}`);
    console.log(`Implemented: ${implemented}`);
    console.log(`Tested: ${tested}`);
    console.log(`✅ Successful: ${successful}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`⏭️  Not Tested: ${total - tested}`);
    
    console.log('\n📋 Detailed Results:');
    testResults.forEach((result, index) => {
        const status = result.tested 
            ? (result.success ? '✅' : '❌')
            : '⏭️';
        console.log(`${index + 1}. ${status} ${result.apiName}`);
        console.log(`   Endpoint: ${result.endpoint}`);
        if (result.error) {
            console.log(`   Error: ${result.error}`);
        }
    });
    
    console.log('\n' + '='.repeat(60));
}

// Export for use in browser console or test runner
if (typeof window !== 'undefined') {
    (window as any).runAPITests = runAllAPITests;
    console.log('💡 To run API tests, call: runAPITests()');
}
